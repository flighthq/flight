//! `Spatial2DNode` — a combined node holding hierarchy, 2D transform, bounds,
//! and appearance in a single struct.
//!
//! This is the concrete node type used by display-object and sprite families
//! that need all four capabilities together. Higher-level packages can use the
//! individual arena types when they need only a subset of capabilities.

use flighthq_types::BlendMode;

use crate::appearance::GraphAppearanceNode;
use crate::bounds::BoundsNode;
use crate::hierarchy::HierarchyNode;
use crate::invalidation::next_revision;
use crate::node_id::{NodeArena, NodeId};
use crate::transform2d::Transform2DNode;

// ---------------------------------------------------------------------------
// Combined data type
// ---------------------------------------------------------------------------

/// Scene graph node combining hierarchy, 2D transform, bounds, and appearance.
///
/// Higher-level packages (display objects, sprites) store their per-node state
/// in an arena of this type. Access to each sub-domain is available through
/// the typed accessor functions in the respective modules.
#[derive(Debug)]
pub struct Spatial2DNode {
    pub hierarchy: HierarchyNode,
    pub transform: Transform2DNode,
    pub bounds: BoundsNode,
    pub appearance: GraphAppearanceNode,
    /// Whether the node participates in the scene (updates, rendering).
    pub enabled: bool,
}

impl Default for Spatial2DNode {
    fn default() -> Self {
        Self {
            hierarchy: HierarchyNode::default(),
            transform: Transform2DNode::default(),
            bounds: BoundsNode::default(),
            appearance: GraphAppearanceNode::default(),
            enabled: true,
        }
    }
}

// ---------------------------------------------------------------------------
// Arena type alias
// ---------------------------------------------------------------------------

/// Arena for `Spatial2DNode` values.
pub type Spatial2DArena = NodeArena<Spatial2DNode>;

// ---------------------------------------------------------------------------
// Hierarchy adapters — delegate to `hierarchy` field
// ---------------------------------------------------------------------------

/// Adds `child` to the end of `target`'s child list.
pub fn add_spatial2d_child(arena: &mut Spatial2DArena, target: NodeId, child: NodeId) {
    let count = arena[target].hierarchy.children.len();
    add_spatial2d_child_at(arena, target, child, count);
}

/// Inserts `child` at `index` in `target`'s child list.
///
/// # Panics
/// Panics if `child == target` or `index > child_count`.
pub fn add_spatial2d_child_at(
    arena: &mut Spatial2DArena,
    target: NodeId,
    child: NodeId,
    index: usize,
) {
    assert_ne!(target, child, "A node cannot be added as a child of itself");
    let child_count = arena[target].hierarchy.children.len();
    assert!(index <= child_count, "Index {index} out of bounds");

    let current_parent = arena[child].hierarchy.parent;
    if current_parent == Some(target) {
        let pos = arena[target]
            .hierarchy
            .children
            .iter()
            .position(|&id| id == child);
        if let Some(pos) = pos {
            if pos == index {
                return;
            }
            arena[target].hierarchy.children.remove(pos);
            let adj = if index > pos { index - 1 } else { index };
            arena[target].hierarchy.children.insert(adj, child);
        }
    } else {
        if let Some(old_parent) = current_parent {
            arena[old_parent]
                .hierarchy
                .children
                .retain(|&id| id != child);
        }
        arena[target].hierarchy.children.insert(index, child);
        arena[child].hierarchy.parent = Some(target);
    }
}

/// Returns `true` if `child` is `source` or any descendant of `source`.
pub fn contains_spatial2d_child(arena: &Spatial2DArena, source: NodeId, child: NodeId) -> bool {
    let mut current = child;
    loop {
        if current == source {
            return true;
        }
        match arena[current].hierarchy.parent {
            Some(p) => current = p,
            None => return false,
        }
    }
}

/// Detaches `node` from its parent.
pub fn detach_spatial2d_node(arena: &mut Spatial2DArena, node: NodeId) {
    if let Some(parent) = arena[node].hierarchy.parent {
        remove_spatial2d_child(arena, parent, node);
    }
}

/// Returns the number of direct children.
pub fn get_spatial2d_child_count(arena: &Spatial2DArena, source: NodeId) -> usize {
    arena[source].hierarchy.children.len()
}

/// Returns the child at `index`, or `None` if out of range.
pub fn get_spatial2d_child_at(
    arena: &Spatial2DArena,
    source: NodeId,
    index: usize,
) -> Option<NodeId> {
    arena[source].hierarchy.children.get(index).copied()
}

/// Returns the parent, or `None` if `source` is a root.
pub fn get_spatial2d_parent(arena: &Spatial2DArena, source: NodeId) -> Option<NodeId> {
    arena[source].hierarchy.parent
}

/// Returns the topmost ancestor, or `source` itself.
pub fn get_spatial2d_root(arena: &Spatial2DArena, source: NodeId) -> NodeId {
    let mut current = source;
    while let Some(parent) = arena[current].hierarchy.parent {
        current = parent;
    }
    current
}

/// Removes `child` from `target`'s child list and clears `child`'s parent.
pub fn remove_spatial2d_child(arena: &mut Spatial2DArena, target: NodeId, child: NodeId) {
    if arena[child].hierarchy.parent != Some(target) {
        return;
    }
    arena[child].hierarchy.parent = None;
    arena[target].hierarchy.children.retain(|&id| id != child);
}

/// Swaps the positions of `child1` and `child2` in `target`'s children.
pub fn swap_spatial2d_children(
    arena: &mut Spatial2DArena,
    target: NodeId,
    child1: NodeId,
    child2: NodeId,
) {
    if arena[child1].hierarchy.parent != Some(target)
        || arena[child2].hierarchy.parent != Some(target)
    {
        return;
    }
    let children = &mut arena[target].hierarchy.children;
    let i1 = children.iter().position(|&id| id == child1);
    let i2 = children.iter().position(|&id| id == child2);
    if let (Some(i1), Some(i2)) = (i1, i2) {
        children.swap(i1, i2);
    }
}

// ---------------------------------------------------------------------------
// Transform adapters
// ---------------------------------------------------------------------------

/// Sets all 2D transform properties and invalidates the transform.
pub fn set_spatial2d_transform(
    arena: &mut Spatial2DArena,
    target: NodeId,
    x: f32,
    y: f32,
    rotation: f32,
    scale_x: f32,
    scale_y: f32,
    pivot_x: f32,
    pivot_y: f32,
) {
    let t = &mut arena[target].transform;
    t.x = x;
    t.y = y;
    t.rotation = rotation;
    t.scale_x = scale_x;
    t.scale_y = scale_y;
    t.pivot_x = pivot_x;
    t.pivot_y = pivot_y;
    t.local_transform_id = next_revision(t.local_transform_id);
}

// ---------------------------------------------------------------------------
// Appearance adapters
// ---------------------------------------------------------------------------

/// Returns the alpha of `source`.
pub fn get_spatial2d_alpha(arena: &Spatial2DArena, source: NodeId) -> f32 {
    arena[source].appearance.alpha
}

/// Returns the blend mode of `source`.
pub fn get_spatial2d_blend_mode(arena: &Spatial2DArena, source: NodeId) -> Option<BlendMode> {
    arena[source].appearance.blend_mode
}

/// Returns the visibility of `source`.
pub fn get_spatial2d_visible(arena: &Spatial2DArena, source: NodeId) -> bool {
    arena[source].appearance.visible
}

/// Sets the alpha and invalidates appearance.
pub fn set_spatial2d_alpha(arena: &mut Spatial2DArena, target: NodeId, alpha: f32) {
    let a = &mut arena[target].appearance;
    a.alpha = alpha.clamp(0.0, 1.0);
    a.appearance_id = next_revision(a.appearance_id);
}

/// Sets the blend mode and invalidates appearance.
pub fn set_spatial2d_blend_mode(
    arena: &mut Spatial2DArena,
    target: NodeId,
    blend_mode: Option<BlendMode>,
) {
    let a = &mut arena[target].appearance;
    a.blend_mode = blend_mode;
    a.appearance_id = next_revision(a.appearance_id);
}

/// Sets visibility and invalidates appearance.
pub fn set_spatial2d_visible(arena: &mut Spatial2DArena, target: NodeId, visible: bool) {
    let a = &mut arena[target].appearance;
    a.visible = visible;
    a.appearance_id = next_revision(a.appearance_id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn new_arena() -> Spatial2DArena {
        NodeArena::new()
    }

    fn insert(arena: &mut Spatial2DArena) -> NodeId {
        arena.insert(Spatial2DNode::default())
    }

    // add_spatial2d_child / remove_spatial2d_child

    #[test]
    fn add_and_remove_child() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        assert_eq!(get_spatial2d_child_count(&arena, parent), 1);
        assert_eq!(get_spatial2d_parent(&arena, child), Some(parent));
        remove_spatial2d_child(&mut arena, parent, child);
        assert_eq!(get_spatial2d_child_count(&arena, parent), 0);
        assert!(get_spatial2d_parent(&arena, child).is_none());
    }

    // contains_spatial2d_child

    #[test]
    fn contains_spatial2d_child_deep() {
        let mut arena = new_arena();
        let root = insert(&mut arena);
        let mid = insert(&mut arena);
        let leaf = insert(&mut arena);
        add_spatial2d_child(&mut arena, root, mid);
        add_spatial2d_child(&mut arena, mid, leaf);
        assert!(contains_spatial2d_child(&arena, root, leaf));
        assert!(!contains_spatial2d_child(&arena, leaf, root));
    }

    // detach_spatial2d_node

    #[test]
    fn detach_spatial2d_node_makes_root() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, child);
        detach_spatial2d_node(&mut arena, child);
        assert!(get_spatial2d_parent(&arena, child).is_none());
        assert_eq!(get_spatial2d_child_count(&arena, parent), 0);
    }

    // get_spatial2d_root

    #[test]
    fn get_spatial2d_root_walks_to_top() {
        let mut arena = new_arena();
        let root = insert(&mut arena);
        let mid = insert(&mut arena);
        let leaf = insert(&mut arena);
        add_spatial2d_child(&mut arena, root, mid);
        add_spatial2d_child(&mut arena, mid, leaf);
        assert_eq!(get_spatial2d_root(&arena, leaf), root);
    }

    // set_spatial2d_transform

    #[test]
    fn set_spatial2d_transform_stores_values() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        set_spatial2d_transform(&mut arena, node, 10.0, 20.0, 45.0, 2.0, 3.0, 1.0, 2.0);
        let t = &arena[node].transform;
        assert_eq!(t.x, 10.0);
        assert_eq!(t.y, 20.0);
        assert_eq!(t.rotation, 45.0);
        assert_ne!(t.local_transform_id, 0);
    }

    // appearance adapters

    #[test]
    fn appearance_defaults_and_setters() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        assert_eq!(get_spatial2d_alpha(&arena, node), 1.0);
        assert!(get_spatial2d_visible(&arena, node));
        assert!(get_spatial2d_blend_mode(&arena, node).is_none());

        set_spatial2d_alpha(&mut arena, node, 0.5);
        assert!((get_spatial2d_alpha(&arena, node) - 0.5).abs() < 1e-6);

        set_spatial2d_visible(&mut arena, node, false);
        assert!(!get_spatial2d_visible(&arena, node));

        set_spatial2d_blend_mode(&mut arena, node, Some(BlendMode::Screen));
        assert_eq!(
            get_spatial2d_blend_mode(&arena, node),
            Some(BlendMode::Screen)
        );
    }

    // swap_spatial2d_children

    #[test]
    fn swap_spatial2d_children_reorders() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        add_spatial2d_child(&mut arena, parent, c0);
        add_spatial2d_child(&mut arena, parent, c1);
        swap_spatial2d_children(&mut arena, parent, c0, c1);
        assert_eq!(get_spatial2d_child_at(&arena, parent, 0), Some(c1));
        assert_eq!(get_spatial2d_child_at(&arena, parent, 1), Some(c0));
    }
}
