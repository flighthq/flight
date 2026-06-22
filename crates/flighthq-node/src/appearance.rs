//! Appearance node — alpha, visibility, and blend mode.
//!
//! `GraphAppearanceNode` is the data struct stored in a `NodeArena`.
//! Free functions follow the `*_node_*` naming convention and are
//! alphabetised within this file.

use flighthq_types::BlendMode;

use crate::invalidation::next_revision;
use crate::node_id::{NodeArena, NodeId};

// ---------------------------------------------------------------------------
// Data type
// ---------------------------------------------------------------------------

/// Appearance properties for a scene graph node.
#[derive(Clone, Debug)]
pub struct GraphAppearanceNode {
    /// Opacity in [0, 1]. Propagated multiplicatively down the hierarchy.
    pub alpha: f32,
    /// Optional compositing blend mode override.
    pub blend_mode: Option<BlendMode>,
    /// Whether this node (and its subtree) is visible.
    pub visible: bool,
    /// Revision counter — incremented whenever appearance changes.
    pub(crate) appearance_id: u32,
}

impl Default for GraphAppearanceNode {
    fn default() -> Self {
        Self {
            alpha: 1.0,
            blend_mode: None,
            visible: true,
            appearance_id: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns the current appearance revision counter for `source`.
///
/// Consumers can compare this against a cached value to detect whether
/// appearance properties have changed since the last inspection.
pub fn get_node_appearance_revision(arena: &NodeArena<GraphAppearanceNode>, source: NodeId) -> u32 {
    arena[source].appearance_id
}

/// Returns the alpha of `source`.
pub fn get_node_alpha(arena: &NodeArena<GraphAppearanceNode>, source: NodeId) -> f32 {
    arena[source].alpha
}

/// Returns the blend mode of `source`, or `None` if none is set.
pub fn get_node_blend_mode(
    arena: &NodeArena<GraphAppearanceNode>,
    source: NodeId,
) -> Option<BlendMode> {
    arena[source].blend_mode
}

/// Returns `true` if `source` is marked visible.
pub fn get_node_visible(arena: &NodeArena<GraphAppearanceNode>, source: NodeId) -> bool {
    arena[source].visible
}

/// Bumps the appearance revision for `target`, signalling that compositing
/// properties have changed and any cached render output is stale.
pub fn invalidate_node_appearance(arena: &mut NodeArena<GraphAppearanceNode>, target: NodeId) {
    let node = &mut arena[target];
    node.appearance_id = next_revision(node.appearance_id);
}

/// Sets the alpha of `target` and invalidates its appearance revision.
pub fn set_node_alpha(arena: &mut NodeArena<GraphAppearanceNode>, target: NodeId, alpha: f32) {
    arena[target].alpha = alpha.clamp(0.0, 1.0);
    invalidate_node_appearance(arena, target);
}

/// Sets the blend mode of `target` and invalidates its appearance revision.
pub fn set_node_blend_mode(
    arena: &mut NodeArena<GraphAppearanceNode>,
    target: NodeId,
    blend_mode: Option<BlendMode>,
) {
    arena[target].blend_mode = blend_mode;
    invalidate_node_appearance(arena, target);
}

/// Sets the visibility of `target` and invalidates its appearance revision.
pub fn set_node_visible(arena: &mut NodeArena<GraphAppearanceNode>, target: NodeId, visible: bool) {
    arena[target].visible = visible;
    invalidate_node_appearance(arena, target);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::invalidation::DIRTY_SENTINEL;

    fn new_arena() -> NodeArena<GraphAppearanceNode> {
        NodeArena::new()
    }

    fn insert(arena: &mut NodeArena<GraphAppearanceNode>) -> NodeId {
        arena.insert(GraphAppearanceNode::default())
    }

    // get_node_alpha

    #[test]
    fn get_node_alpha_returns_default() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        assert_eq!(get_node_alpha(&arena, node), 1.0);
    }

    // get_node_appearance_revision

    #[test]
    fn get_node_appearance_revision_starts_at_zero() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        assert_eq!(get_node_appearance_revision(&arena, node), 0);
    }

    // get_node_blend_mode

    #[test]
    fn get_node_blend_mode_returns_none_by_default() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        assert!(get_node_blend_mode(&arena, node).is_none());
    }

    // get_node_visible

    #[test]
    fn get_node_visible_returns_true_by_default() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        assert!(get_node_visible(&arena, node));
    }

    // invalidate_node_appearance

    #[test]
    fn invalidate_node_appearance_bumps_revision() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        let before = get_node_appearance_revision(&arena, node);
        invalidate_node_appearance(&mut arena, node);
        let after = get_node_appearance_revision(&arena, node);
        assert_ne!(before, after);
        assert_ne!(after, DIRTY_SENTINEL);
    }

    // set_node_alpha

    #[test]
    fn set_node_alpha_clamps_and_invalidates() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_alpha(&mut arena, node, 0.5);
        assert_eq!(get_node_alpha(&arena, node), 0.5);
        let rev = get_node_appearance_revision(&arena, node);
        assert_ne!(rev, 0);
        // Out-of-range values are clamped.
        set_node_alpha(&mut arena, node, 2.0);
        assert_eq!(get_node_alpha(&arena, node), 1.0);
        set_node_alpha(&mut arena, node, -1.0);
        assert_eq!(get_node_alpha(&arena, node), 0.0);
    }

    // set_node_blend_mode

    #[test]
    fn set_node_blend_mode_stores_value_and_invalidates() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        let rev_before = get_node_appearance_revision(&arena, node);
        set_node_blend_mode(&mut arena, node, Some(BlendMode::Add));
        assert_eq!(get_node_blend_mode(&arena, node), Some(BlendMode::Add));
        assert_ne!(get_node_appearance_revision(&arena, node), rev_before);
        set_node_blend_mode(&mut arena, node, None);
        assert!(get_node_blend_mode(&arena, node).is_none());
    }

    // set_node_visible

    #[test]
    fn set_node_visible_toggles_and_invalidates() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_node_visible(&mut arena, node, false);
        assert!(!get_node_visible(&arena, node));
        let rev = get_node_appearance_revision(&arena, node);
        set_node_visible(&mut arena, node, true);
        assert!(get_node_visible(&arena, node));
        assert_ne!(get_node_appearance_revision(&arena, node), rev);
    }
}
