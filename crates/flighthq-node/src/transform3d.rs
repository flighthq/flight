//! 3D transform node — local and world 4×4 matrices.
//!
//! Analogous to `transform2d` but for 3D scenes. The world matrix is built
//! by concatenating the local 4×4 matrix with the parent's world 4×4 matrix.
//! Both are kept in sync via the same revision-ID pattern used for 2D.

use flighthq_geometry::{
    copy_matrix4, create_matrix4_identity, inverse_matrix4, matrix4_transform_point,
    multiply_matrix4,
};
use flighthq_types::{Matrix4, Matrix4Like, Vector3Like};

use crate::hierarchy::{HierarchyNode, get_node_children, get_node_parent};
use crate::invalidation::{DIRTY_SENTINEL, is_dirty, next_revision};
use crate::node_id::{NodeArena, NodeId};

// ---------------------------------------------------------------------------
// Internal helpers — field-copy conversions between Matrix4 and Matrix4Like
// ---------------------------------------------------------------------------

#[inline]
fn matrix4_to_like(m: &Matrix4) -> Matrix4Like {
    Matrix4Like { m: m.m }
}

#[inline]
fn like_to_matrix4(m: &Matrix4Like) -> Matrix4 {
    Matrix4 { m: m.m }
}

// ---------------------------------------------------------------------------
// Data type
// ---------------------------------------------------------------------------

/// 3D transform node: local 4×4 matrix and lazily-computed world 4×4 matrix.
#[derive(Clone, Debug)]
pub struct Transform3DNode {
    /// Local 4×4 transform matrix (user-controlled).
    pub local_matrix: Matrix4,

    /// Lazily-computed world matrix stored as MatrixLike so geometry helpers
    /// can write directly into it.
    pub(crate) world_matrix: Option<Matrix4Like>,
    /// Snapshot of `local_transform_id` used to produce `world_matrix`.
    pub(crate) world_using_local_id: u32,
    /// Snapshot of the parent's `world_transform_id` used to build our world.
    pub(crate) world_using_parent_id: u32,
    /// Blended revision ID for the world transform.
    pub world_transform_id: u32,
    /// Revision counter for the local matrix; bumped via [`invalidate_node_transform3d`].
    pub(crate) local_transform_id: u32,
}

impl Default for Transform3DNode {
    fn default() -> Self {
        Self {
            local_matrix: Matrix4::default(), // identity
            world_matrix: None,
            world_using_local_id: DIRTY_SENTINEL,
            world_using_parent_id: DIRTY_SENTINEL,
            world_transform_id: 0,
            local_transform_id: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Converts `point` from world (global) coordinates into `source`'s local
/// coordinates, writing the result into `out`.
///
/// `out` may alias `point`; the inputs are read before `out` is written.
pub fn convert_node_vector3_global_to_local(
    out: &mut Vector3Like,
    arena: &mut NodeArena<Transform3DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    source: NodeId,
    point: &Vector3Like,
) {
    let world = get_node_world_transform_matrix4(arena, hierarchy, source);
    let world_like = matrix4_to_like(&world);
    let mut inv = Matrix4Like {
        m: create_matrix4_identity().m,
    };
    inverse_matrix4(&mut inv, &world_like);
    let p = *point;
    matrix4_transform_point(out, &inv, &p);
}

/// Converts `point` from `source`'s local coordinates into world (global)
/// coordinates, writing the result into `out`.
///
/// `out` may alias `point`; the inputs are read before `out` is written.
pub fn convert_node_vector3_local_to_global(
    out: &mut Vector3Like,
    arena: &mut NodeArena<Transform3DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    source: NodeId,
    point: &Vector3Like,
) {
    let world = get_node_world_transform_matrix4(arena, hierarchy, source);
    let world_like = matrix4_to_like(&world);
    let p = *point;
    matrix4_transform_point(out, &world_like, &p);
}

/// Ensures the world matrix for `target` is up to date by walking up the
/// hierarchy and recomputing any stale ancestor world matrices first.
pub fn ensure_node_world_transform_matrix4(
    arena: &mut NodeArena<Transform3DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    target: NodeId,
) {
    let parent = get_node_parent(hierarchy, target);
    let parent_world_id = if let Some(p) = parent {
        ensure_node_world_transform_matrix4(arena, hierarchy, p);
        arena[p].world_transform_id
    } else {
        0
    };

    let node = &arena[target];
    if is_dirty(node.world_using_local_id, node.local_transform_id)
        || is_dirty(node.world_using_parent_id, parent_world_id)
    {
        recompute_world_transform3d(arena, target, parent, parent_world_id);
    }
}

/// Returns the local transform revision for `source`.
pub fn get_node_local_transform3d_revision(
    arena: &NodeArena<Transform3DNode>,
    source: NodeId,
) -> u32 {
    arena[source].local_transform_id
}

/// Returns a copy of the lazily-computed world 4×4 matrix for `target`.
///
/// The hierarchy arena is required to walk parent links.
pub fn get_node_world_transform_matrix4(
    arena: &mut NodeArena<Transform3DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    target: NodeId,
) -> Matrix4 {
    ensure_node_world_transform_matrix4(arena, hierarchy, target);
    like_to_matrix4(arena[target].world_matrix.as_ref().unwrap())
}

/// Returns the world transform revision for `source`.
pub fn get_node_world_transform3d_revision(
    arena: &NodeArena<Transform3DNode>,
    source: NodeId,
) -> u32 {
    arena[source].world_transform_id
}

/// Marks `target`'s local transform as dirty, forcing a world-matrix
/// recompute on the next call to [`ensure_node_world_transform_matrix4`] or
/// [`get_node_world_transform_matrix4`].
pub fn invalidate_node_transform3d(arena: &mut NodeArena<Transform3DNode>, target: NodeId) {
    let node = &mut arena[target];
    node.local_transform_id = next_revision(node.local_transform_id);
}

/// Propagates world transforms from `root` downward through the hierarchy in
/// pre-order, keeping all descendants up to date in a single pass.
pub fn propagate_node_transforms3d(
    arena: &mut NodeArena<Transform3DNode>,
    hierarchy: &NodeArena<HierarchyNode>,
    root: NodeId,
) {
    ensure_node_world_transform_matrix4(arena, hierarchy, root);
    let children = get_node_children(hierarchy, root);
    for child in children {
        propagate_node_transforms3d(arena, hierarchy, child);
    }
}

/// Sets the local 4×4 matrix for `target` and invalidates the local
/// transform revision.
pub fn set_node_transform3d(
    arena: &mut NodeArena<Transform3DNode>,
    target: NodeId,
    local_matrix: Matrix4,
) {
    let node = &mut arena[target];
    node.local_matrix = local_matrix;
    node.local_transform_id = next_revision(node.local_transform_id);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn recompute_world_transform3d(
    arena: &mut NodeArena<Transform3DNode>,
    target: NodeId,
    parent: Option<NodeId>,
    parent_world_id: u32,
) {
    let local_id = arena[target].local_transform_id;

    if let Some(p) = parent {
        // Copy values into temporaries to avoid overlapping borrows.
        let parent_world =
            matrix4_to_like(&like_to_matrix4(arena[p].world_matrix.as_ref().unwrap()));
        let local = matrix4_to_like(&arena[target].local_matrix);
        let id = create_matrix4_identity();
        let out = arena[target]
            .world_matrix
            .get_or_insert_with(|| Matrix4Like { m: id.m });
        multiply_matrix4(out, &parent_world, &local);
    } else {
        let local = matrix4_to_like(&arena[target].local_matrix);
        let id = create_matrix4_identity();
        let out = arena[target]
            .world_matrix
            .get_or_insert_with(|| Matrix4Like { m: id.m });
        copy_matrix4(out, &local);
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

    // convert_node_vector3_global_to_local

    #[test]
    fn convert_node_vector3_global_to_local_inverts_world_translation() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform3DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        let mut m = Matrix4::default();
        m.m[12] = 3.0;
        m.m[13] = 4.0;
        m.m[14] = 5.0;
        set_node_transform3d(&mut t_arena, node_t, m);
        let mut out = Vector3Like::default();
        let global = Vector3Like {
            x: 13.0,
            y: 14.0,
            z: 15.0,
        };
        convert_node_vector3_global_to_local(&mut out, &mut t_arena, &h_arena, node_t, &global);
        assert!((out.x - 10.0).abs() < 1e-3, "x={}", out.x);
        assert!((out.y - 10.0).abs() < 1e-3, "y={}", out.y);
        assert!((out.z - 10.0).abs() < 1e-3, "z={}", out.z);
    }

    // convert_node_vector3_local_to_global

    #[test]
    fn convert_node_vector3_local_to_global_applies_world_translation() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform3DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        let mut m = Matrix4::default();
        m.m[12] = 3.0;
        m.m[13] = 4.0;
        m.m[14] = 5.0;
        set_node_transform3d(&mut t_arena, node_t, m);
        let mut out = Vector3Like::default();
        let local = Vector3Like {
            x: 10.0,
            y: 10.0,
            z: 10.0,
        };
        convert_node_vector3_local_to_global(&mut out, &mut t_arena, &h_arena, node_t, &local);
        assert!((out.x - 13.0).abs() < 1e-3, "x={}", out.x);
        assert!((out.y - 14.0).abs() < 1e-3, "y={}", out.y);
        assert!((out.z - 15.0).abs() < 1e-3, "z={}", out.z);
    }

    #[test]
    fn convert_node_vector3_local_to_global_round_trips_global_to_local() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform3DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        let mut m = Matrix4::default();
        m.m[12] = 2.0;
        m.m[13] = -3.0;
        m.m[14] = 7.0;
        set_node_transform3d(&mut t_arena, node_t, m);
        let original = Vector3Like {
            x: 1.0,
            y: 2.0,
            z: 3.0,
        };
        let mut global = Vector3Like::default();
        convert_node_vector3_local_to_global(
            &mut global,
            &mut t_arena,
            &h_arena,
            node_t,
            &original,
        );
        let mut back = Vector3Like::default();
        convert_node_vector3_global_to_local(&mut back, &mut t_arena, &h_arena, node_t, &global);
        assert!((back.x - original.x).abs() < 1e-3, "x={}", back.x);
        assert!((back.y - original.y).abs() < 1e-3, "y={}", back.y);
        assert!((back.z - original.z).abs() < 1e-3, "z={}", back.z);
    }

    // ensure_node_world_transform_matrix4

    #[test]
    fn ensure_node_world_transform_matrix4_composes_parent_and_child() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let parent_t = t_arena.insert(Transform3DNode::default());
        let parent_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(parent_t, parent_h);
        let child_t = t_arena.insert(Transform3DNode::default());
        let child_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(child_t, child_h);
        add_node_child(&mut h_arena, parent_h, child_h);
        let mut pm = Matrix4::default();
        pm.m[12] = 10.0;
        set_node_transform3d(&mut t_arena, parent_t, pm);
        let mut cm = Matrix4::default();
        cm.m[12] = 5.0;
        set_node_transform3d(&mut t_arena, child_t, cm);
        ensure_node_world_transform_matrix4(&mut t_arena, &h_arena, child_t);
        let w = t_arena[child_t].world_matrix.as_ref().unwrap();
        assert!((w.m[12] - 15.0).abs() < 1e-5, "tx={}", w.m[12]);
    }

    // get_node_local_transform3d_revision

    #[test]
    fn get_node_local_transform3d_revision_starts_at_zero() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let node = t_arena.insert(Transform3DNode::default());
        assert_eq!(get_node_local_transform3d_revision(&t_arena, node), 0);
    }

    // invalidate_node_transform3d

    #[test]
    fn invalidate_node_transform3d_bumps_revision() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let node = t_arena.insert(Transform3DNode::default());
        let before = get_node_local_transform3d_revision(&t_arena, node);
        invalidate_node_transform3d(&mut t_arena, node);
        let after = get_node_local_transform3d_revision(&t_arena, node);
        assert_ne!(before, after);
        assert_ne!(after, DIRTY_SENTINEL);
    }

    // set_node_transform3d

    #[test]
    fn set_node_transform3d_stores_matrix_and_invalidates() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let node = t_arena.insert(Transform3DNode::default());
        let mut m = Matrix4::default();
        // Translation is at column 3 in column-major layout: indices 12 (tx), 13 (ty), 14 (tz).
        m.m[12] = 3.0;
        m.m[13] = 4.0;
        m.m[14] = 5.0;
        set_node_transform3d(&mut t_arena, node, m);
        assert_eq!(t_arena[node].local_matrix.m[12], 3.0);
        assert_ne!(get_node_local_transform3d_revision(&t_arena, node), 0);
    }

    // get_node_world_transform_matrix4 (root — world == local)

    #[test]
    fn get_node_world_transform_matrix4_root_world_equals_local() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform3DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());

        // Translation at column-major index 12 (tx).
        let mut m = Matrix4::default();
        m.m[12] = 7.0;
        set_node_transform3d(&mut t_arena, node_t, m);

        let world = get_node_world_transform_matrix4(&mut t_arena, &h_arena, node_t);
        assert!((world.m[12] - 7.0).abs() < 1e-6, "tx={}", world.m[12]);
    }

    // propagate_node_transforms3d — child inherits parent translation

    #[test]
    fn propagate_node_transforms3d_child_inherits_parent() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();

        let parent_t = t_arena.insert(Transform3DNode::default());
        let parent_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(parent_t, parent_h, "key alignment required");

        let child_t = t_arena.insert(Transform3DNode::default());
        let child_h = h_arena.insert(HierarchyNode::default());
        assert_eq!(child_t, child_h, "key alignment required");

        add_node_child(&mut h_arena, parent_h, child_h);

        // Parent: translate x by 10 (column-major index 12 = tx).
        let mut pm = Matrix4::default();
        pm.m[12] = 10.0;
        set_node_transform3d(&mut t_arena, parent_t, pm);

        // Child: translate x by 5.
        let mut cm = Matrix4::default();
        cm.m[12] = 5.0;
        set_node_transform3d(&mut t_arena, child_t, cm);

        propagate_node_transforms3d(&mut t_arena, &h_arena, parent_t);

        let world = get_node_world_transform_matrix4(&mut t_arena, &h_arena, child_t);
        // Combined tx should be 15 (10 + 5 for identity-rotation matrices).
        assert!(
            (world.m[12] - 15.0).abs() < 1e-5,
            "expected tx=15 got {}",
            world.m[12]
        );
    }

    // get_node_world_transform3d_revision stable when clean

    #[test]
    fn get_node_world_transform3d_revision_stable_when_clean() {
        let mut t_arena: NodeArena<Transform3DNode> = NodeArena::new();
        let mut h_arena: NodeArena<HierarchyNode> = NodeArena::new();
        let node_t = t_arena.insert(Transform3DNode::default());
        let _ = h_arena.insert(HierarchyNode::default());
        propagate_node_transforms3d(&mut t_arena, &h_arena, node_t);
        let rev1 = get_node_world_transform3d_revision(&t_arena, node_t);
        propagate_node_transforms3d(&mut t_arena, &h_arena, node_t);
        let rev2 = get_node_world_transform3d_revision(&t_arena, node_t);
        assert_eq!(rev1, rev2);
    }
}
