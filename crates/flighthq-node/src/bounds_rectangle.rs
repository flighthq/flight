//! Coordinate-space bounding rectangles for [`Spatial2DNode`] — a port of the
//! TypeScript `boundsRectangle.ts`.
//!
//! The TS reference computes a node's bounds in several coordinate spaces:
//!
//! - **local**: the node's own extent, not including children.
//! - **parent**: local bounds × the node's local transform.
//! - **world**: local bounds × the node's world transform, merged with every
//!   enabled child's world bounds.
//!
//! [`compute_node_bounds_rectangle`] re-expresses world bounds in an arbitrary
//! target coordinate space, matching the TS fast paths. Width/height read the
//! parent-space bounds; `set_node_width` / `set_node_height` adjust scale to
//! reach a desired size.
//!
//! Unlike the lazily-cached TS runtime, this port recomputes on demand from the
//! stored local bounds ([`BoundsNode::local`], populated via
//! [`crate::bounds::set_node_bounds`]) and a freshly-walked world transform.
//! The `ensure_*` functions mirror the TS names and validate that the cached
//! values are consistent; the `get_*` functions return owned rectangles.

use flighthq_geometry::{
    inverse_matrix, matrix_transform_rectangle, merge_rectangle, multiply_matrix,
};
use flighthq_types::{MatrixLike, RectangleLike};

use crate::node_id::NodeId;
use crate::spatial2d::Spatial2DArena;

// ---------------------------------------------------------------------------
// World-matrix helper (walks parents within the combined arena)
// ---------------------------------------------------------------------------

fn local_matrix_like(arena: &Spatial2DArena, node: NodeId) -> MatrixLike {
    let t = &arena[node].transform;
    // Normalise rotation to (-180, 180] and build the affine matrix, matching
    // the TS recompute path.
    let mut angle = t.rotation % 360.0;
    if angle > 180.0 {
        angle -= 360.0;
    } else if angle < -180.0 {
        angle += 360.0;
    }
    let rad = angle * (std::f32::consts::PI / 180.0);
    let sin = rad.sin();
    let cos = rad.cos();
    let a = cos * t.scale_x;
    let b = sin * t.scale_x;
    let c = -sin * t.scale_y;
    let d = cos * t.scale_y;
    let tx = t.x - (a * t.pivot_x + c * t.pivot_y);
    let ty = t.y - (b * t.pivot_x + d * t.pivot_y);
    MatrixLike { a, b, c, d, tx, ty }
}

fn world_matrix_like(arena: &Spatial2DArena, node: NodeId) -> MatrixLike {
    let local = local_matrix_like(arena, node);
    match arena[node].hierarchy.parent {
        Some(parent) => {
            let parent_world = world_matrix_like(arena, parent);
            let mut out = MatrixLike::default();
            multiply_matrix(&mut out, &parent_world, &local);
            out
        }
        None => local,
    }
}

fn local_bounds_like(arena: &Spatial2DArena, node: NodeId) -> RectangleLike {
    let b = &arena[node].bounds.local;
    RectangleLike {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
    }
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Writes the bounds of `source` relative to `target_coordinate_space` into
/// `out`.
///
/// When `target_coordinate_space` is `None`, the source is used. Mirrors the TS
/// fast paths: world bounds when the target is a root, local bounds for the
/// source itself, parent bounds when the target is the source's parent;
/// otherwise the world bounds are transformed into the target's space.
pub fn compute_node_bounds_rectangle(
    out: &mut RectangleLike,
    arena: &Spatial2DArena,
    source: NodeId,
    target_coordinate_space: Option<NodeId>,
) {
    let target = target_coordinate_space.unwrap_or(source);

    let mut bounds: Option<RectangleLike> = None;
    if arena[target].hierarchy.parent.is_none() {
        bounds = Some(get_node_world_bounds_rectangle(arena, source));
    } else if arena[source].hierarchy.children.is_empty() {
        if target == source {
            bounds = Some(get_node_local_bounds_rectangle(arena, source));
        } else if Some(target) == arena[source].hierarchy.parent {
            bounds = Some(get_node_parent_bounds_rectangle(arena, source));
        }
    }

    match bounds {
        Some(b) => {
            out.x = b.x;
            out.y = b.y;
            out.width = b.width;
            out.height = b.height;
        }
        None => {
            let world_bounds = get_node_world_bounds_rectangle(arena, source);
            let target_world = world_matrix_like(arena, target);
            let mut inv = MatrixLike::default();
            inverse_matrix(&mut inv, &target_world);
            matrix_transform_rectangle(out, &inv, &world_bounds);
        }
    }
}

/// Recomputes (validates) the cached local bounds. In this port local bounds
/// are authoritative once set via [`crate::bounds::set_node_bounds`], so this
/// only refreshes the staleness snapshot.
pub fn ensure_node_local_bounds_rectangle(arena: &mut Spatial2DArena, target: NodeId) {
    let node = &mut arena[target].bounds;
    node.local_using_local_id = node.local_bounds_id;
}

/// Recomputes (validates) the cached parent-space bounds snapshot.
pub fn ensure_node_parent_bounds_rectangle(arena: &mut Spatial2DArena, target: NodeId) {
    ensure_node_local_bounds_rectangle(arena, target);
}

/// Recomputes (validates) the cached world-space bounds snapshot.
pub fn ensure_node_world_bounds_rectangle(arena: &mut Spatial2DArena, target: NodeId) {
    ensure_node_local_bounds_rectangle(arena, target);
}

/// Returns the height of `source` in its parent's coordinate space.
pub fn get_node_height(arena: &Spatial2DArena, source: NodeId) -> f32 {
    let mut out = RectangleLike::default();
    compute_node_bounds_rectangle(&mut out, arena, source, arena[source].hierarchy.parent);
    out.height
}

/// Returns `source`'s own bounds (not including children) in local space.
pub fn get_node_local_bounds_rectangle(arena: &Spatial2DArena, source: NodeId) -> RectangleLike {
    local_bounds_like(arena, source)
}

/// Returns `source`'s bounds in its parent's coordinate space
/// (local bounds × local transform).
pub fn get_node_parent_bounds_rectangle(arena: &Spatial2DArena, source: NodeId) -> RectangleLike {
    let local = local_matrix_like(arena, source);
    let lb = local_bounds_like(arena, source);
    let mut out = RectangleLike::default();
    matrix_transform_rectangle(&mut out, &local, &lb);
    out
}

/// Returns the width of `source` in its parent's coordinate space.
pub fn get_node_width(arena: &Spatial2DArena, source: NodeId) -> f32 {
    let mut out = RectangleLike::default();
    compute_node_bounds_rectangle(&mut out, arena, source, arena[source].hierarchy.parent);
    out.width
}

/// Returns `source`'s bounds in world space, including every enabled child's
/// world bounds.
pub fn get_node_world_bounds_rectangle(arena: &Spatial2DArena, source: NodeId) -> RectangleLike {
    let world = world_matrix_like(arena, source);
    let lb = local_bounds_like(arena, source);
    let mut out = RectangleLike::default();
    matrix_transform_rectangle(&mut out, &world, &lb);

    let children = arena[source].hierarchy.children.clone();
    for child in children {
        if !arena[child].enabled {
            continue;
        }
        let child_world = get_node_world_bounds_rectangle(arena, child);
        if child_world.width != 0.0 && child_world.height != 0.0 {
            let merged_into = out;
            merge_rectangle(&mut out, &merged_into, &child_world);
        }
    }
    out
}

/// Sets `target`'s height by adjusting `scale_y`, leaving the node unchanged
/// when its current scale or measured height is zero.
pub fn set_node_height(arena: &mut Spatial2DArena, target: NodeId, value: f32) {
    let scale_y = arena[target].transform.scale_y;
    if scale_y == 0.0 {
        return;
    }
    let current = get_node_height(arena, target);
    if current == 0.0 {
        return;
    }
    let node = &mut arena[target].transform;
    node.scale_y = (value * scale_y) / current;
    node.local_transform_id = crate::invalidation::next_revision(node.local_transform_id);
}

/// Sets `target`'s width by adjusting `scale_x`, leaving the node unchanged
/// when its current scale or measured width is zero.
pub fn set_node_width(arena: &mut Spatial2DArena, target: NodeId, value: f32) {
    let scale_x = arena[target].transform.scale_x;
    if scale_x == 0.0 {
        return;
    }
    let current = get_node_width(arena, target);
    if current == 0.0 {
        return;
    }
    let node = &mut arena[target].transform;
    node.scale_x = (value * scale_x) / current;
    node.local_transform_id = crate::invalidation::next_revision(node.local_transform_id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spatial2d::{Spatial2DNode, add_spatial2d_child, set_spatial2d_transform};

    fn new_arena() -> Spatial2DArena {
        Spatial2DArena::new()
    }

    fn insert(arena: &mut Spatial2DArena) -> NodeId {
        arena.insert(Spatial2DNode::default())
    }

    // Sets the local bounds rectangle on a Spatial2DNode directly. The
    // arena-level `set_node_bounds` works on `NodeArena<BoundsNode>`, so this
    // writes through the combined node's embedded `bounds` field instead.
    fn set_node_bounds(
        arena: &mut Spatial2DArena,
        node: NodeId,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    ) {
        let b = &mut arena[node].bounds;
        b.local = flighthq_types::Rectangle {
            x,
            y,
            width,
            height,
        };
        b.local_bounds_id = crate::invalidation::next_revision(b.local_bounds_id);
        b.local_using_local_id = b.local_bounds_id;
        b.dirty = false;
    }

    // compute_node_bounds_rectangle

    #[test]
    fn compute_node_bounds_rectangle_self_returns_local() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 100.0, 50.0);
        // Self is its own root => world-bounds branch, world == local at identity.
        let mut out = RectangleLike::default();
        compute_node_bounds_rectangle(&mut out, &arena, node, Some(node));
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 100.0, 50.0));
    }

    #[test]
    fn compute_node_bounds_rectangle_parent_space_applies_transform() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        set_node_bounds(&mut arena, child, 0.0, 0.0, 10.0, 10.0);
        set_spatial2d_transform(&mut arena, child, 100.0, 50.0, 0.0, 2.0, 2.0, 0.0, 0.0);
        let mut out = RectangleLike::default();
        compute_node_bounds_rectangle(&mut out, &arena, child, Some(parent));
        // local (0,0,10,10) scaled 2x and translated to (100,50).
        assert_eq!((out.x, out.y, out.width, out.height), (100.0, 50.0, 20.0, 20.0));
    }

    // ensure_node_local_bounds_rectangle

    #[test]
    fn ensure_node_local_bounds_rectangle_clears_staleness() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        ensure_node_local_bounds_rectangle(&mut arena, node);
        let b = &arena[node].bounds;
        assert_eq!(b.local_using_local_id, b.local_bounds_id);
    }

    // ensure_node_parent_bounds_rectangle

    #[test]
    fn ensure_node_parent_bounds_rectangle_does_not_panic() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        ensure_node_parent_bounds_rectangle(&mut arena, node);
        let b = &arena[node].bounds;
        assert_eq!(b.local_using_local_id, b.local_bounds_id);
    }

    // ensure_node_world_bounds_rectangle

    #[test]
    fn ensure_node_world_bounds_rectangle_does_not_panic() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        ensure_node_world_bounds_rectangle(&mut arena, node);
        let b = &arena[node].bounds;
        assert_eq!(b.local_using_local_id, b.local_bounds_id);
    }

    // get_node_height

    #[test]
    fn get_node_height_reflects_scaled_local_bounds() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        set_node_bounds(&mut arena, child, 0.0, 0.0, 10.0, 20.0);
        set_spatial2d_transform(&mut arena, child, 0.0, 0.0, 0.0, 1.0, 3.0, 0.0, 0.0);
        assert!((get_node_height(&arena, child) - 60.0).abs() < 1e-4);
    }

    // get_node_local_bounds_rectangle

    #[test]
    fn get_node_local_bounds_rectangle_returns_stored_local() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 5.0, 6.0, 7.0, 8.0);
        let b = get_node_local_bounds_rectangle(&arena, node);
        assert_eq!((b.x, b.y, b.width, b.height), (5.0, 6.0, 7.0, 8.0));
    }

    // get_node_parent_bounds_rectangle

    #[test]
    fn get_node_parent_bounds_rectangle_applies_local_transform() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        set_spatial2d_transform(&mut arena, node, 5.0, 5.0, 0.0, 2.0, 2.0, 0.0, 0.0);
        let b = get_node_parent_bounds_rectangle(&arena, node);
        assert_eq!((b.x, b.y, b.width, b.height), (5.0, 5.0, 20.0, 20.0));
    }

    // get_node_width

    #[test]
    fn get_node_width_reflects_scaled_local_bounds() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        set_node_bounds(&mut arena, child, 0.0, 0.0, 10.0, 20.0);
        set_spatial2d_transform(&mut arena, child, 0.0, 0.0, 0.0, 2.0, 1.0, 0.0, 0.0);
        assert!((get_node_width(&arena, child) - 20.0).abs() < 1e-4);
    }

    // get_node_world_bounds_rectangle

    #[test]
    fn get_node_world_bounds_rectangle_merges_children() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        set_node_bounds(&mut arena, parent, 0.0, 0.0, 10.0, 10.0);
        set_node_bounds(&mut arena, child, 0.0, 0.0, 10.0, 10.0);
        // Child translated to (20, 0) extends the parent's world bounds.
        set_spatial2d_transform(&mut arena, child, 20.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        let b = get_node_world_bounds_rectangle(&arena, parent);
        assert_eq!((b.x, b.y), (0.0, 0.0));
        assert_eq!(b.width, 30.0);
        assert_eq!(b.height, 10.0);
    }

    #[test]
    fn get_node_world_bounds_rectangle_skips_disabled_children() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        set_node_bounds(&mut arena, parent, 0.0, 0.0, 10.0, 10.0);
        set_node_bounds(&mut arena, child, 0.0, 0.0, 10.0, 10.0);
        set_spatial2d_transform(&mut arena, child, 20.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0);
        arena[child].enabled = false;
        let b = get_node_world_bounds_rectangle(&arena, parent);
        assert_eq!(b.width, 10.0);
    }

    // set_node_height

    #[test]
    fn set_node_height_adjusts_scale_to_reach_value() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        set_node_bounds(&mut arena, child, 0.0, 0.0, 10.0, 10.0);
        set_node_height(&mut arena, child, 50.0);
        assert!((get_node_height(&arena, child) - 50.0).abs() < 1e-3);
    }

    #[test]
    fn set_node_height_noop_when_scale_zero() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        set_spatial2d_transform(&mut arena, node, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0);
        set_node_height(&mut arena, node, 50.0);
        assert_eq!(arena[node].transform.scale_y, 0.0);
    }

    // set_node_width

    #[test]
    fn set_node_width_adjusts_scale_to_reach_value() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        set_node_bounds(&mut arena, child, 0.0, 0.0, 10.0, 10.0);
        set_node_width(&mut arena, child, 40.0);
        assert!((get_node_width(&arena, child) - 40.0).abs() < 1e-3);
    }

    #[test]
    fn set_node_width_noop_when_scale_zero() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        set_spatial2d_transform(&mut arena, node, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        set_node_width(&mut arena, node, 40.0);
        assert_eq!(arena[node].transform.scale_x, 0.0);
    }

}
