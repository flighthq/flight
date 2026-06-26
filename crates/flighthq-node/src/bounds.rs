//! Bounds node — local and world axis-aligned bounding rectangles.
//!
//! `BoundsNode` stores a lazily-computed local bounding rectangle and a
//! lazily-computed world bounding rectangle. Both are kept fresh via the
//! same revision-ID pattern used for transforms.

use flighthq_geometry::create_rectangle;
use flighthq_types::Rectangle;

use crate::invalidation::{DIRTY_SENTINEL, is_dirty, next_revision};
use crate::node_id::{NodeArena, NodeId};

// ---------------------------------------------------------------------------
// Data type
// ---------------------------------------------------------------------------

/// Bounds node: stores local and world bounding rectangles with dirty tracking.
#[derive(Clone, Debug)]
pub struct BoundsNode {
    /// Cached local bounding rectangle (object-space, not including children).
    pub local: Rectangle,
    /// Cached world bounding rectangle (transformed into world space).
    pub world: Rectangle,
    /// When `true`, both `local` and `world` must be recomputed before use.
    pub dirty: bool,

    /// Revision counter for the local bounds; bumped via [`invalidate_node_bounds`].
    pub(crate) local_bounds_id: u32,
    /// Revision counter for the node's rasterizable content; bumped via
    /// [`invalidate_bounds_node_local_content`]. Distinct from `local_bounds_id`:
    /// content changes (a re-paint) and extent changes (a re-measure) are tracked
    /// separately, mirroring TS `invalidateNodeLocalContent` /
    /// `invalidateNodeLocalBounds`.
    pub(crate) local_content_id: u32,
    /// Snapshot of `local_bounds_id` used to compute the current `local`.
    pub(crate) local_using_local_id: u32,
    /// Snapshot of the world-transform ID used to compute the current `world`.
    pub(crate) world_using_transform_id: u32,
    /// Current revision of the world bounds.
    pub(crate) world_bounds_id: u32,
}

impl Default for BoundsNode {
    fn default() -> Self {
        Self {
            local: Rectangle::default(),
            world: Rectangle::default(),
            dirty: true,
            local_bounds_id: 0,
            local_content_id: 0,
            local_using_local_id: DIRTY_SENTINEL,
            world_using_transform_id: DIRTY_SENTINEL,
            world_bounds_id: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns the local-bounds revision of `bounds`.
///
/// Operates directly on a borrowed [`BoundsNode`], for crates whose node embeds
/// a `BoundsNode` (e.g. a display object's `Spatial2DNode`) rather than holding
/// a `NodeArena<BoundsNode>`.
pub fn get_bounds_node_local_bounds_revision(bounds: &BoundsNode) -> u32 {
    bounds.local_bounds_id
}

/// Returns the local-content revision of `bounds`.
///
/// Operates directly on a borrowed [`BoundsNode`]. The content revision tracks
/// rasterizable-payload changes independently of the extent (bounds) revision.
pub fn get_bounds_node_local_content_revision(bounds: &BoundsNode) -> u32 {
    bounds.local_content_id
}

/// Bumps the local-bounds revision of `bounds` and marks it dirty.
///
/// The `&mut BoundsNode` counterpart of [`invalidate_node_bounds`], for crates
/// whose node embeds a `BoundsNode` directly.
pub fn invalidate_bounds_node_local_bounds(bounds: &mut BoundsNode) {
    bounds.dirty = true;
    bounds.local_bounds_id = next_revision(bounds.local_bounds_id);
    bounds.world_using_transform_id = DIRTY_SENTINEL;
}

/// Bumps the local-content revision of `bounds` (rasterizable payload changed).
///
/// The `&mut BoundsNode` content-revision counterpart, mirroring TS
/// `invalidateNodeLocalContent`.
pub fn invalidate_bounds_node_local_content(bounds: &mut BoundsNode) {
    bounds.local_content_id = next_revision(bounds.local_content_id);
}

/// Returns a reference to `source`'s local bounding rectangle.
///
/// The caller is responsible for calling [`invalidate_node_bounds`] when the
/// node's geometry changes, then recomputing `local` before calling this.
pub fn get_node_bounds(arena: &NodeArena<BoundsNode>, source: NodeId) -> &Rectangle {
    &arena[source].local
}

/// Returns the local bounds revision for `source`.
pub fn get_node_local_bounds_revision(arena: &NodeArena<BoundsNode>, source: NodeId) -> u32 {
    arena[source].local_bounds_id
}

/// Returns a reference to `source`'s world bounding rectangle.
///
/// The caller is responsible for keeping the world bounds in sync (call
/// [`set_node_world_bounds`] after recomputing).
pub fn get_node_world_bounds(arena: &NodeArena<BoundsNode>, source: NodeId) -> &Rectangle {
    &arena[source].world
}

/// Returns the world bounds revision for `source`.
pub fn get_node_world_bounds_revision(arena: &NodeArena<BoundsNode>, source: NodeId) -> u32 {
    arena[source].world_bounds_id
}

/// Marks both the local and world bounds of `target` as dirty and bumps the
/// local-bounds revision.
///
/// Call this whenever the node's geometry (shape, text content, etc.) changes.
pub fn invalidate_node_bounds(arena: &mut NodeArena<BoundsNode>, target: NodeId) {
    let node = &mut arena[target];
    node.dirty = true;
    node.local_bounds_id = next_revision(node.local_bounds_id);
    // Force world recompute on next sync.
    node.world_using_transform_id = DIRTY_SENTINEL;
}

/// Returns `true` if `source`'s bounds are currently marked dirty.
pub fn is_node_bounds_dirty(arena: &NodeArena<BoundsNode>, source: NodeId) -> bool {
    arena[source].dirty
}

/// Writes `rect` into `target`'s local bounds and marks them as clean,
/// bumping the local-bounds revision so world-bounds consumers know to
/// recompute.
pub fn set_node_bounds(
    arena: &mut NodeArena<BoundsNode>,
    target: NodeId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) {
    let node = &mut arena[target];
    node.local = create_rectangle(x, y, width, height);
    node.local_bounds_id = next_revision(node.local_bounds_id);
    node.local_using_local_id = node.local_bounds_id;
    node.dirty = false;
}

/// Writes `rect` into `target`'s world bounds and marks them as consistent
/// with the given `world_transform_revision`.
pub fn set_node_world_bounds(
    arena: &mut NodeArena<BoundsNode>,
    target: NodeId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    world_transform_revision: u32,
) {
    let node = &mut arena[target];
    node.world = create_rectangle(x, y, width, height);
    node.world_using_transform_id = world_transform_revision;
    node.world_bounds_id = next_revision(node.world_bounds_id);
}

/// Returns `true` if the world bounds are stale relative to the given
/// `world_transform_revision`.
pub fn is_node_world_bounds_dirty(
    arena: &NodeArena<BoundsNode>,
    source: NodeId,
    world_transform_revision: u32,
) -> bool {
    // World-bounds staleness is fully captured by the transform-revision
    // comparison: invalidate_node_bounds resets world_using_transform_id to
    // DIRTY_SENTINEL (which never equals a valid revision), and
    // set_node_world_bounds writes the revision it is consistent with. The
    // local `dirty` flag belongs to is_node_bounds_dirty, not here.
    is_dirty(
        arena[source].world_using_transform_id,
        world_transform_revision,
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn new_arena() -> NodeArena<BoundsNode> {
        NodeArena::new()
    }

    fn insert(arena: &mut NodeArena<BoundsNode>) -> NodeId {
        arena.insert(BoundsNode::default())
    }

    // get_bounds_node_local_bounds_revision

    #[test]
    fn get_bounds_node_local_bounds_revision_starts_at_zero() {
        let bounds = BoundsNode::default();
        assert_eq!(get_bounds_node_local_bounds_revision(&bounds), 0);
    }

    // get_bounds_node_local_content_revision

    #[test]
    fn get_bounds_node_local_content_revision_starts_at_zero() {
        let bounds = BoundsNode::default();
        assert_eq!(get_bounds_node_local_content_revision(&bounds), 0);
    }

    // invalidate_bounds_node_local_bounds

    #[test]
    fn invalidate_bounds_node_local_bounds_bumps_and_marks_dirty() {
        let mut bounds = BoundsNode::default();
        bounds.dirty = false;
        let before = get_bounds_node_local_bounds_revision(&bounds);
        invalidate_bounds_node_local_bounds(&mut bounds);
        assert!(bounds.dirty);
        assert_ne!(get_bounds_node_local_bounds_revision(&bounds), before);
    }

    // invalidate_bounds_node_local_content

    #[test]
    fn invalidate_bounds_node_local_content_bumps_only_content() {
        let mut bounds = BoundsNode::default();
        let before_bounds = get_bounds_node_local_bounds_revision(&bounds);
        let before_content = get_bounds_node_local_content_revision(&bounds);
        invalidate_bounds_node_local_content(&mut bounds);
        assert_ne!(
            get_bounds_node_local_content_revision(&bounds),
            before_content
        );
        assert_eq!(
            get_bounds_node_local_bounds_revision(&bounds),
            before_bounds
        );
    }

    // get_node_bounds

    #[test]
    fn get_node_bounds_returns_default_zero_rect() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        let b = get_node_bounds(&arena, node);
        assert_eq!((b.x, b.y, b.width, b.height), (0.0, 0.0, 0.0, 0.0));
    }

    // get_node_local_bounds_revision

    #[test]
    fn get_node_local_bounds_revision_starts_at_zero() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        assert_eq!(get_node_local_bounds_revision(&arena, node), 0);
    }

    // get_node_world_bounds

    #[test]
    fn get_node_world_bounds_returns_default_zero_rect() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        let b = get_node_world_bounds(&arena, node);
        assert_eq!((b.x, b.y, b.width, b.height), (0.0, 0.0, 0.0, 0.0));
    }

    // invalidate_node_bounds

    #[test]
    fn invalidate_node_bounds_marks_dirty_and_bumps_revision() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        // Clear dirty by setting bounds first.
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        assert!(!is_node_bounds_dirty(&arena, node));
        let before = get_node_local_bounds_revision(&arena, node);
        invalidate_node_bounds(&mut arena, node);
        assert!(is_node_bounds_dirty(&arena, node));
        assert_ne!(get_node_local_bounds_revision(&arena, node), before);
    }

    // is_node_bounds_dirty

    #[test]
    fn is_node_bounds_dirty_true_by_default() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        assert!(is_node_bounds_dirty(&arena, node));
    }

    // is_node_world_bounds_dirty

    #[test]
    fn is_node_world_bounds_dirty_detects_stale_transform() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);
        set_node_world_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0, 1);
        assert!(!is_node_world_bounds_dirty(&arena, node, 1));
        assert!(is_node_world_bounds_dirty(&arena, node, 2));
    }

    // set_node_bounds

    #[test]
    fn set_node_bounds_stores_rect_clears_dirty_and_bumps_revision() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_bounds(&mut arena, node, 5.0, 10.0, 100.0, 200.0);
        let b = get_node_bounds(&arena, node);
        assert_eq!((b.x, b.y, b.width, b.height), (5.0, 10.0, 100.0, 200.0));
        assert!(!is_node_bounds_dirty(&arena, node));
        assert_ne!(get_node_local_bounds_revision(&arena, node), 0);
    }

    // set_node_world_bounds

    #[test]
    fn set_node_world_bounds_stores_and_bumps_revision() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_world_bounds(&mut arena, node, 1.0, 2.0, 3.0, 4.0, 42);
        let wb = get_node_world_bounds(&arena, node);
        assert_eq!((wb.x, wb.y, wb.width, wb.height), (1.0, 2.0, 3.0, 4.0));
        assert_ne!(get_node_world_bounds_revision(&arena, node), 0);
        assert!(!is_node_world_bounds_dirty(&arena, node, 42));
    }
}
