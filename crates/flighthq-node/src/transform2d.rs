//! 2D transform node — local and world affine matrices.
//!
//! The transform node stores the user-facing transform properties (x, y,
//! rotation, scaleX, scaleY, pivotX, pivotY) plus a lazily computed local
//! matrix and a lazily computed world matrix. Both are recomputed on demand
//! using revision IDs to avoid redundant work.
//!
//! World-matrix propagation is handled by [`propagate_node_transforms`],
//! which does a single pre-order walk of the hierarchy starting from a given
//! node.

use std::f32::consts::PI;

use flighthq_geometry::{
    copy_matrix, inverse_matrix_transform_point_xy, matrix_transform_point_xy, multiply_matrix,
};
use flighthq_types::{Matrix, MatrixLike, Vector2Like};

use crate::hierarchy::{HierarchyNode, get_node_children, get_node_parent};
use crate::invalidation::{DIRTY_SENTINEL, is_dirty, next_revision};
use crate::node_id::{NodeArena, NodeId};

// ---------------------------------------------------------------------------
// Internal helpers — field-copy conversions between Matrix and MatrixLike
// ---------------------------------------------------------------------------

#[inline]
fn matrix_to_like(m: &Matrix) -> MatrixLike {
    MatrixLike {
        a: m.a,
        b: m.b,
        c: m.c,
        d: m.d,
        tx: m.tx,
        ty: m.ty,
    }
}

#[inline]
fn like_to_matrix(m: &MatrixLike) -> Matrix {
    Matrix {
        a: m.a,
        b: m.b,
        c: m.c,
        d: m.d,
        tx: m.tx,
        ty: m.ty,
    }
}

// ---------------------------------------------------------------------------
// Data type
// ---------------------------------------------------------------------------

/// 2D transform node combining user-facing properties with cached matrices.
#[derive(Clone, Debug)]
pub struct Transform2DNode {
    // User-facing properties.
    pub pivot_x: f32,
    pub pivot_y: f32,
    /// Rotation in degrees.
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub x: f32,
    pub y: f32,

    // Cached local matrix stored as MatrixLike so geometry helpers can write
    // directly into it.
    pub(crate) local_matrix: Option<MatrixLike>,
    /// Revision of the user properties used to compute `local_matrix`.
    pub(crate) local_transform_using_id: u32,
    /// Current revision of user-facing transform properties.
    pub(crate) local_transform_id: u32,

    // Cached world matrix.
    pub(crate) world_matrix: Option<MatrixLike>,
    /// Snapshot of `local_transform_id` that produced `world_matrix`.
    pub(crate) world_using_local_id: u32,
    /// Snapshot of the parent's `world_transform_id` used to build our world matrix.
    pub(crate) world_using_parent_id: u32,
    /// Blended revision ID for the world transform (exposed to external caches).
    pub world_transform_id: u32,

    // Cached trig values to avoid re-computing sin/cos on unchanged rotations.
    pub(crate) rotation_angle: f32,
    pub(crate) rotation_cos: f32,
    pub(crate) rotation_sin: f32,
}

impl Default for Transform2DNode {
    fn default() -> Self {
        Self {
            pivot_x: 0.0,
            pivot_y: 0.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            x: 0.0,
            y: 0.0,
            local_matrix: None,
            local_transform_using_id: DIRTY_SENTINEL,
            local_transform_id: 0,
            world_matrix: None,
            world_using_local_id: DIRTY_SENTINEL,
            world_using_parent_id: DIRTY_SENTINEL,
            world_transform_id: 0,
            rotation_angle: 0.0,
            rotation_cos: 1.0,
            rotation_sin: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Converts `vector` from world (global) coordinates into `source`'s local
/// coordinates, writing the result into `out`.
///
/// `out` may alias `vector`; the inputs are read before `out` is written.
pub fn convert_node_vector2_global_to_local(
    out: &mut Vector2Like,
    arena: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    source: NodeId,
    vector: &Vector2Like,
) {
    let world = get_node_world_matrix(arena, hierarchy, source);
    let world_like = matrix_to_like(&world);
    inverse_matrix_transform_point_xy(out, &world_like, vector.x, vector.y);
}

/// Converts `vector` from `source`'s local coordinates into world (global)
/// coordinates, writing the result into `out`.
///
/// `out` may alias `vector`; the inputs are read before `out` is written.
pub fn convert_node_vector2_local_to_global(
    out: &mut Vector2Like,
    arena: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    source: NodeId,
    vector: &Vector2Like,
) {
    let world = get_node_world_matrix(arena, hierarchy, source);
    let world_like = matrix_to_like(&world);
    matrix_transform_point_xy(out, &world_like, vector.x, vector.y);
}

/// Ensures the local matrix for `target` is up to date, recomputing if
/// necessary.
pub fn ensure_node_local_transform_matrix(arena: &mut NodeArena<Transform2DNode>, target: NodeId) {
    let node = &arena[target];
    if !is_dirty(node.local_transform_using_id, node.local_transform_id) {
        return;
    }
    recompute_local_transform(arena, target);
}

/// Ensures the world matrix for `target` is up to date by first ensuring the
/// parent's world matrix is up to date, then recomputing if stale.
pub fn ensure_node_world_transform_matrix(
    arena: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    target: NodeId,
) {
    let parent = get_node_parent(hierarchy, target);
    let parent_world_id = if let Some(p) = parent {
        ensure_node_world_transform_matrix(arena, hierarchy, p);
        arena[p].world_transform_id
    } else {
        0
    };

    let node = &arena[target];
    if is_dirty(node.world_using_local_id, node.local_transform_id)
        || is_dirty(node.world_using_parent_id, parent_world_id)
    {
        recompute_world_transform(arena, hierarchy, target, parent, parent_world_id);
    }
}

/// Returns a copy of the lazily-computed local 2D transform matrix.
pub fn get_node_local_transform_matrix(
    arena: &mut NodeArena<Transform2DNode>,
    target: NodeId,
) -> Matrix {
    ensure_node_local_transform_matrix(arena, target);
    like_to_matrix(arena[target].local_matrix.as_ref().unwrap())
}

/// Returns the transform properties for `source` as `(x, y, rotation, scale_x, scale_y, pivot_x, pivot_y)`.
pub fn get_node_transform2d(
    arena: &NodeArena<Transform2DNode>,
    source: NodeId,
) -> (f32, f32, f32, f32, f32, f32, f32) {
    let n = &arena[source];
    (
        n.x, n.y, n.rotation, n.scale_x, n.scale_y, n.pivot_x, n.pivot_y,
    )
}

/// Returns a copy of the lazily-computed world 2D transform matrix.
pub fn get_node_world_matrix(
    arena: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    target: NodeId,
) -> Matrix {
    ensure_node_world_transform_matrix(arena, hierarchy, target);
    like_to_matrix(arena[target].world_matrix.as_ref().unwrap())
}

/// Returns a copy of the lazily-computed world 2D transform matrix.
///
/// Spelled-out alias of [`get_node_world_matrix`] matching the public
/// `getNodeWorldTransformMatrix` name; both ensure the world matrix first.
pub fn get_node_world_transform_matrix(
    arena: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    target: NodeId,
) -> Matrix {
    get_node_world_matrix(arena, hierarchy, target)
}

/// Returns the local transform revision for `source`.
pub fn get_node_local_transform_revision(
    arena: &NodeArena<Transform2DNode>,
    source: NodeId,
) -> u32 {
    arena[source].local_transform_id
}

/// Returns the world transform revision for `source`.
pub fn get_node_world_transform_revision(
    arena: &NodeArena<Transform2DNode>,
    source: NodeId,
) -> u32 {
    arena[source].world_transform_id
}

/// Marks `target`'s local transform as dirty, forcing a recompute on the next
/// call to [`ensure_node_local_transform_matrix`] or
/// [`ensure_node_world_transform_matrix`].
pub fn invalidate_node_transform(arena: &mut NodeArena<Transform2DNode>, target: NodeId) {
    let node = &mut arena[target];
    node.local_transform_id = next_revision(node.local_transform_id);
}

/// Propagates world transforms from `root` downwards through the hierarchy,
/// recomputing every descendant's world matrix in pre-order.
pub fn propagate_node_transforms(
    arena: &mut NodeArena<Transform2DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    root: NodeId,
) {
    ensure_node_world_transform_matrix(arena, hierarchy, root);
    let children = get_node_children(hierarchy, root);
    for child in children {
        propagate_node_transforms(arena, hierarchy, child);
    }
}

/// Sets the 2D transform properties for `target` and invalidates its local
/// transform revision.
pub fn set_node_transform2d(
    arena: &mut NodeArena<Transform2DNode>,
    target: NodeId,
    x: f32,
    y: f32,
    rotation: f32,
    scale_x: f32,
    scale_y: f32,
    pivot_x: f32,
    pivot_y: f32,
) {
    let node = &mut arena[target];
    node.x = x;
    node.y = y;
    node.rotation = rotation;
    node.scale_x = scale_x;
    node.scale_y = scale_y;
    node.pivot_x = pivot_x;
    node.pivot_y = pivot_y;
    node.local_transform_id = next_revision(node.local_transform_id);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEG_TO_RAD: f32 = PI / 180.0;

fn recompute_local_transform(arena: &mut NodeArena<Transform2DNode>, target: NodeId) {
    // Read inputs into locals before mutating.
    let (
        x,
        y,
        rotation,
        scale_x,
        scale_y,
        pivot_x,
        pivot_y,
        prev_angle,
        prev_cos,
        prev_sin,
        local_transform_id,
    ) = {
        let n = &arena[target];
        (
            n.x,
            n.y,
            n.rotation,
            n.scale_x,
            n.scale_y,
            n.pivot_x,
            n.pivot_y,
            n.rotation_angle,
            n.rotation_cos,
            n.rotation_sin,
            n.local_transform_id,
        )
    };

    // Update cached trig only when the angle changed.
    let (cos, sin) = if (rotation - prev_angle).abs() > f32::EPSILON {
        // Normalise to (-180, 180].
        let mut angle = rotation % 360.0;
        if angle > 180.0 {
            angle -= 360.0;
        } else if angle < -180.0 {
            angle += 360.0;
        }
        let rad = angle * DEG_TO_RAD;
        let sin = rad.sin();
        let cos = rad.cos();
        let n = &mut arena[target];
        n.rotation_angle = angle;
        n.rotation_cos = cos;
        n.rotation_sin = sin;
        (cos, sin)
    } else {
        (prev_cos, prev_sin)
    };

    let node = &mut arena[target];
    let m = node.local_matrix.get_or_insert_with(MatrixLike::default);
    m.a = cos * scale_x;
    m.b = sin * scale_x;
    m.c = -sin * scale_y;
    m.d = cos * scale_y;
    // Pivot point: (pivot_x, pivot_y) in local space maps to (x, y) in parent space.
    m.tx = x - (m.a * pivot_x + m.c * pivot_y);
    m.ty = y - (m.b * pivot_x + m.d * pivot_y);
    node.local_transform_using_id = local_transform_id;
}

fn recompute_world_transform(
    arena: &mut NodeArena<Transform2DNode>,
    _hierarchy: &NodeArena<HierarchyNode>,
    target: NodeId,
    parent: Option<NodeId>,
    parent_world_id: u32,
) {
    // Ensure local matrix is current.
    ensure_node_local_transform_matrix(arena, target);

    let local_id = arena[target].local_transform_id;

    if let Some(p) = parent {
        // Copy parent world and own local into temporaries to avoid borrow conflict.
        let parent_world = *arena[p].world_matrix.as_ref().unwrap();
        let local = *arena[target].local_matrix.as_ref().unwrap();
        let out = arena[target]
            .world_matrix
            .get_or_insert_with(MatrixLike::default);
        multiply_matrix(out, &parent_world, &local);
    } else {
        let local = *arena[target].local_matrix.as_ref().unwrap();
        let out = arena[target]
            .world_matrix
            .get_or_insert_with(MatrixLike::default);
        copy_matrix(out, &local);
    }

    let node = &mut arena[target];
    node.world_using_local_id = local_id;
    node.world_using_parent_id = parent_world_id;
    node.world_transform_id = (local_id << 16) | (parent_world_id & 0xffff);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hierarchy::add_node_child;

    // convert_node_vector2_global_to_local

    #[test]
    fn convert_node_vector2_global_to_local_inverts_world_translation() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform2DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        set_node_transform2d(&mut t_arena, node_t, 100.0, 50.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        let mut out = Vector2Like::default();
        let global = Vector2Like { x: 110.0, y: 70.0 };
        convert_node_vector2_global_to_local(&mut out, &mut t_arena, &h_arena, node_t, &global);
        // global (110,70) - translation (100,50) => local (10,20).
        assert!((out.x - 10.0).abs() < 1e-4, "x={}", out.x);
        assert!((out.y - 20.0).abs() < 1e-4, "y={}", out.y);
    }

    // convert_node_vector2_local_to_global

    #[test]
    fn convert_node_vector2_local_to_global_applies_world_translation() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform2DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        set_node_transform2d(&mut t_arena, node_t, 100.0, 50.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        let mut out = Vector2Like::default();
        let local = Vector2Like { x: 10.0, y: 20.0 };
        convert_node_vector2_local_to_global(&mut out, &mut t_arena, &h_arena, node_t, &local);
        // local (10,20) + translation (100,50) => global (110,70).
        assert!((out.x - 110.0).abs() < 1e-4, "x={}", out.x);
        assert!((out.y - 70.0).abs() < 1e-4, "y={}", out.y);
    }

    #[test]
    fn convert_node_vector2_local_to_global_round_trips_global_to_local() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform2DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        set_node_transform2d(&mut t_arena, node_t, 30.0, -15.0, 90.0, 2.0, 2.0, 0.0, 0.0);
        let original = Vector2Like { x: 7.0, y: 11.0 };
        let mut global = Vector2Like::default();
        convert_node_vector2_local_to_global(&mut global, &mut t_arena, &h_arena, node_t, &original);
        let mut back = Vector2Like::default();
        convert_node_vector2_global_to_local(&mut back, &mut t_arena, &h_arena, node_t, &global);
        assert!((back.x - original.x).abs() < 1e-3, "x={}", back.x);
        assert!((back.y - original.y).abs() < 1e-3, "y={}", back.y);
    }

    // ensure_node_local_transform_matrix

    #[test]
    fn ensure_node_local_transform_matrix_recomputes_after_invalidation() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        ensure_node_local_transform_matrix(&mut t_arena, node);
        assert_eq!(
            t_arena[node].local_transform_using_id,
            t_arena[node].local_transform_id
        );
        set_node_transform2d(&mut t_arena, node, 5.0, 6.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        assert_ne!(
            t_arena[node].local_transform_using_id,
            t_arena[node].local_transform_id
        );
        ensure_node_local_transform_matrix(&mut t_arena, node);
        let m = t_arena[node].local_matrix.unwrap();
        assert!((m.tx - 5.0).abs() < 1e-5, "tx={}", m.tx);
        assert!((m.ty - 6.0).abs() < 1e-5, "ty={}", m.ty);
        assert_eq!(
            t_arena[node].local_transform_using_id,
            t_arena[node].local_transform_id
        );
    }

    // ensure_node_world_transform_matrix

    #[test]
    fn ensure_node_world_transform_matrix_composes_parent_and_child() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let parent_t = t_arena.insert(Transform2DNode::default());
        let parent_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(parent_t, parent_h);
        let child_t = t_arena.insert(Transform2DNode::default());
        let child_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(child_t, child_h);
        add_node_child(&mut h_arena, parent_h, child_h);
        set_node_transform2d(&mut t_arena, parent_t, 100.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        set_node_transform2d(&mut t_arena, child_t, 50.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        ensure_node_world_transform_matrix(&mut t_arena, &h_arena, child_t);
        let w = t_arena[child_t].world_matrix.unwrap();
        assert!((w.tx - 150.0).abs() < 1e-5, "tx={}", w.tx);
    }

    // get_node_world_transform_matrix

    #[test]
    fn get_node_world_transform_matrix_root_equals_local() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform2DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        set_node_transform2d(&mut t_arena, node_t, 5.0, 10.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        let world = get_node_world_transform_matrix(&mut t_arena, &h_arena, node_t);
        assert!((world.tx - 5.0).abs() < 1e-5, "tx={}", world.tx);
        assert!((world.ty - 10.0).abs() < 1e-5, "ty={}", world.ty);
    }

    // get_node_local_transform_revision

    #[test]
    fn get_node_local_transform_revision_starts_at_zero() {
        let mut t_arena = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        assert_eq!(get_node_local_transform_revision(&t_arena, node), 0);
    }

    // get_node_transform2d

    #[test]
    fn get_node_transform2d_returns_defaults() {
        let mut t_arena = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        let (x, y, r, sx, sy, px, py) = get_node_transform2d(&t_arena, node);
        assert_eq!(
            (x, y, r, sx, sy, px, py),
            (0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0)
        );
    }

    // invalidate_node_transform

    #[test]
    fn invalidate_node_transform_bumps_revision() {
        let mut t_arena = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        let before = get_node_local_transform_revision(&t_arena, node);
        invalidate_node_transform(&mut t_arena, node);
        let after = get_node_local_transform_revision(&t_arena, node);
        assert_ne!(before, after);
        assert_ne!(after, DIRTY_SENTINEL);
    }

    // set_node_transform2d

    #[test]
    fn set_node_transform2d_stores_values_and_invalidates() {
        let mut t_arena = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        set_node_transform2d(&mut t_arena, node, 10.0, 20.0, 45.0, 2.0, 3.0, 5.0, 6.0);
        let (x, y, r, sx, sy, px, py) = get_node_transform2d(&t_arena, node);
        assert_eq!(
            (x, y, r, sx, sy, px, py),
            (10.0, 20.0, 45.0, 2.0, 3.0, 5.0, 6.0)
        );
        assert_ne!(get_node_local_transform_revision(&t_arena, node), 0);
    }

    // get_node_local_transform_matrix / ensure_node_local_transform_matrix

    #[test]
    fn get_node_local_transform_matrix_identity_at_origin() {
        let mut t_arena = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        let m = get_node_local_transform_matrix(&mut t_arena, node);
        assert!((m.a - 1.0).abs() < 1e-6);
        assert!(m.b.abs() < 1e-6);
        assert!(m.c.abs() < 1e-6);
        assert!((m.d - 1.0).abs() < 1e-6);
        assert!(m.tx.abs() < 1e-6);
        assert!(m.ty.abs() < 1e-6);
    }

    #[test]
    fn get_node_local_transform_matrix_translation() {
        let mut t_arena = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        set_node_transform2d(&mut t_arena, node, 100.0, 200.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        let m = get_node_local_transform_matrix(&mut t_arena, node);
        assert!((m.tx - 100.0).abs() < 1e-5, "tx={}", m.tx);
        assert!((m.ty - 200.0).abs() < 1e-5, "ty={}", m.ty);
    }

    #[test]
    fn get_node_local_transform_matrix_rotation_90() {
        let mut t_arena = NodeArena::new();
        let node = t_arena.insert(Transform2DNode::default());
        set_node_transform2d(&mut t_arena, node, 0.0, 0.0, 90.0, 1.0, 1.0, 0.0, 0.0);
        let m = get_node_local_transform_matrix(&mut t_arena, node);
        // cos(90°) ≈ 0, sin(90°) ≈ 1 → a≈0, b≈1, c≈-1, d≈0
        assert!(m.a.abs() < 1e-5, "a={}", m.a);
        assert!((m.b - 1.0).abs() < 1e-5, "b={}", m.b);
        assert!((m.c + 1.0).abs() < 1e-5, "c={}", m.c);
        assert!(m.d.abs() < 1e-5, "d={}", m.d);
    }

    // propagate_node_transforms / get_node_world_matrix

    #[test]
    fn get_node_world_matrix_root_equals_local() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let root_t = t_arena.insert(Transform2DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        set_node_transform2d(&mut t_arena, root_t, 5.0, 10.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        let world = get_node_world_matrix(&mut t_arena, &h_arena, root_t);
        assert!((world.tx - 5.0).abs() < 1e-5, "tx={}", world.tx);
        assert!((world.ty - 10.0).abs() < 1e-5, "ty={}", world.ty);
    }

    #[test]
    fn propagate_node_transforms_child_inherits_parent_translation() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();

        let parent_t = t_arena.insert(Transform2DNode::default());
        let parent_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(parent_t, parent_h, "key alignment required for this test");

        let child_t = t_arena.insert(Transform2DNode::default());
        let child_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(child_t, child_h, "key alignment required for this test");

        add_node_child(&mut h_arena, parent_h, child_h);

        set_node_transform2d(&mut t_arena, parent_t, 100.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        set_node_transform2d(&mut t_arena, child_t, 50.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0);

        propagate_node_transforms(&mut t_arena, &h_arena, parent_t);

        let world = get_node_world_matrix(&mut t_arena, &h_arena, child_t);
        assert!(
            (world.tx - 150.0).abs() < 1e-5,
            "expected tx=150 got {}",
            world.tx
        );
    }

    #[test]
    fn get_node_world_transform_revision_stable_when_clean() {
        let mut t_arena: NodeArena<Transform2DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform2DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        propagate_node_transforms(&mut t_arena, &h_arena, node_t);
        let rev1 = get_node_world_transform_revision(&t_arena, node_t);
        propagate_node_transforms(&mut t_arena, &h_arena, node_t);
        let rev2 = get_node_world_transform_revision(&t_arena, node_t);
        assert_eq!(rev1, rev2);
    }
}
