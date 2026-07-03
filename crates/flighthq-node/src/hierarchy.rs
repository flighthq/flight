//! Scene graph hierarchy — parent/child relationship management.
//!
//! All operations take `(&mut NodeArena<HierarchyNode>, NodeId)` so the
//! arena is the single source of truth. Functions are free and
//! alphabetised within this file.

use crate::node_id::{NodeArena, NodeId};

// ---------------------------------------------------------------------------
// Data type
// ---------------------------------------------------------------------------

/// Hierarchy node: stores the parent link, the ordered child list, and an
/// optional name used for name-based child lookup.
#[derive(Debug, Default)]
pub struct HierarchyNode {
    /// Parent node, or `None` if this is a root.
    pub parent: Option<NodeId>,
    /// Ordered children — index 0 is back (bottom), last index is front (top).
    pub children: Vec<NodeId>,
    /// Optional node name, used by [`get_node_child_by_name`].
    pub name: Option<String>,
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Appends `child` to the front (top) of `target`'s child list.
///
/// Equivalent to calling [`add_node_child_at`] with `index ==
/// get_node_child_count(arena, target)`.
///
/// # Panics
/// Panics if `child == target` or if either ID is not in the arena.
pub fn add_node_child(arena: &mut NodeArena<HierarchyNode>, target: NodeId, child: NodeId) {
    let count = get_node_child_count(arena, target);
    add_node_child_at(arena, target, child, count);
}

/// Inserts `child` into `target`'s child list at the given `index`.
///
/// Index 0 is the back (bottom); `get_node_child_count(..)` appends to
/// the front (top). If `child` is already a child of `target`, it is
/// moved to the new position.
///
/// # Panics
/// Panics if `child == target`, if `index` is out of range, or if either
/// ID is not in the arena.
pub fn add_node_child_at(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    child: NodeId,
    index: usize,
) {
    assert_ne!(target, child, "A node cannot be added as a child of itself");

    // Determine the current child count before borrowing mutably.
    let child_count = arena[target].children.len();
    assert!(
        index <= child_count,
        "Index {index} out of bounds (child count {child_count})"
    );

    // Detach from current parent if necessary.
    let current_parent = arena[child].parent;
    if current_parent == Some(target) {
        // Already a child of target — move to new position.
        let pos = arena[target].children.iter().position(|&id| id == child);
        if let Some(pos) = pos {
            if pos == index {
                return; // Already at the requested position.
            }
            arena[target].children.remove(pos);
            // Final-index semantics (matches TS splice(index, 0) on the
            // post-removal list): the child ends up at `index`. Clamp to the
            // new length so a moved child can land at the end.
            let insert_at = index.min(arena[target].children.len());
            arena[target].children.insert(insert_at, child);
        }
    } else {
        // Detach from old parent.
        if let Some(old_parent) = current_parent {
            let old_children = &mut arena[old_parent].children;
            old_children.retain(|&id| id != child);
        }
        arena[target].children.insert(index, child);
        arena[child].parent = Some(target);
    }
}

/// Appends multiple children to `target` in order.
pub fn add_node_children(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    children: &[NodeId],
) {
    for &child in children {
        add_node_child(arena, target, child);
    }
}

/// Returns `true` if `child` is `source` or a descendant of `source`.
pub fn contains_node_child(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    child: NodeId,
) -> bool {
    let mut current = child;
    loop {
        if current == source {
            return true;
        }
        match arena[current].parent {
            Some(parent) => current = parent,
            None => return false,
        }
    }
}

/// Detaches `node` from its parent, making it a root node.
///
/// No-op if the node has no parent.
pub fn detach_node(arena: &mut NodeArena<HierarchyNode>, node: NodeId) {
    let parent = arena[node].parent;
    if let Some(parent_id) = parent {
        remove_node_child(arena, parent_id, node);
    }
}

/// Returns the first direct child of `source` whose `name` matches `name`,
/// or `None` if no child has that name.
pub fn get_node_child_by_name(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    name: &str,
) -> Option<NodeId> {
    arena[source]
        .children
        .iter()
        .find(|&&child| arena[child].name.as_deref() == Some(name))
        .copied()
}

/// Returns the number of direct children of `source`.
pub fn get_node_child_count(arena: &NodeArena<HierarchyNode>, source: NodeId) -> usize {
    arena[source].children.len()
}

/// Returns the child at `index`, or `None` if out of range.
pub fn get_node_child_at(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    index: usize,
) -> Option<NodeId> {
    arena[source].children.get(index).copied()
}

/// Returns a copy of the child list of `source`.
pub fn get_node_children(arena: &NodeArena<HierarchyNode>, source: NodeId) -> Vec<NodeId> {
    arena[source].children.clone()
}

/// Returns the depth of `source` in the hierarchy (root = 0).
pub fn get_node_depth(arena: &NodeArena<HierarchyNode>, source: NodeId) -> usize {
    let mut depth = 0usize;
    let mut current = source;
    while let Some(parent) = arena[current].parent {
        depth += 1;
        current = parent;
    }
    depth
}

/// Returns the index of `child` in `source`'s child list, or `None`.
pub fn get_node_child_index(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    child: NodeId,
) -> Option<usize> {
    arena[source].children.iter().position(|&id| id == child)
}

/// Returns the parent of `source`, or `None` if it is a root.
pub fn get_node_parent(arena: &NodeArena<HierarchyNode>, source: NodeId) -> Option<NodeId> {
    arena[source].parent
}

/// Returns the topmost ancestor of `source`, or `source` itself if it is a root.
pub fn get_node_root(arena: &NodeArena<HierarchyNode>, source: NodeId) -> NodeId {
    let mut current = source;
    while let Some(parent) = arena[current].parent {
        current = parent;
    }
    current
}

/// Removes `child` from `target`'s child list and clears `child`'s parent.
///
/// No-op if `child` is not a direct child of `target`.
pub fn remove_node_child(arena: &mut NodeArena<HierarchyNode>, target: NodeId, child: NodeId) {
    if arena[child].parent != Some(target) {
        return;
    }
    arena[child].parent = None;
    arena[target].children.retain(|&id| id != child);
}

/// Removes the child at `index` from `target`'s child list.
///
/// Returns the removed child ID, or `None` if `index` is out of range.
pub fn remove_node_child_at(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    index: usize,
) -> Option<NodeId> {
    if index >= arena[target].children.len() {
        return None;
    }
    let child = arena[target].children[index];
    remove_node_child(arena, target, child);
    Some(child)
}

/// Removes all children from `target` in the range `[begin, end]` (inclusive).
///
/// Defaults: `begin = 0`, `end = last_index`.
///
/// # Panics
/// Panics if the range is invalid (end < begin, begin < 0, end ≥ count).
pub fn remove_node_children(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    begin: usize,
    end: Option<usize>,
) {
    let count = arena[target].children.len();
    if count == 0 || begin >= count {
        return;
    }
    let end = end.unwrap_or(count - 1);
    assert!(
        end >= begin && end < count,
        "Range [{begin}, {end}] out of bounds (count {count})"
    );

    // Collect children to remove first to avoid borrow issues.
    let to_remove: Vec<NodeId> = arena[target].children[begin..=end].to_vec();
    for child in to_remove {
        remove_node_child(arena, target, child);
    }
}

/// Changes the position of `child` within `target`'s child list.
///
/// No-op if `child` is not a direct child of `target` or `index` is out
/// of range.
pub fn set_node_child_index(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    child: NodeId,
    index: usize,
) {
    if arena[child].parent != Some(target) {
        return;
    }
    let children = &mut arena[target].children;
    if index >= children.len() {
        return;
    }
    if let Some(pos) = children.iter().position(|&id| id == child)
        && pos != index
    {
        children.remove(pos);
        // Final-index semantics (matches TS splice(index, 0) on the
        // post-removal list). The guard above ensures index < len, so
        // index is a valid insertion point after removal.
        children.insert(index, child);
    }
}

/// Swaps the positions of `child1` and `child2` in `target`'s child list.
///
/// Both nodes must be direct children of `target`. No-op otherwise.
pub fn swap_node_children(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    child1: NodeId,
    child2: NodeId,
) {
    if arena[child1].parent != Some(target) || arena[child2].parent != Some(target) {
        return;
    }
    let children = &mut arena[target].children;
    let i1 = children.iter().position(|&id| id == child1);
    let i2 = children.iter().position(|&id| id == child2);
    if let (Some(i1), Some(i2)) = (i1, i2) {
        children.swap(i1, i2);
    }
}

/// Swaps the children at `index1` and `index2` within `target`.
///
/// # Panics
/// Panics if either index is out of range and the child list is non-empty.
pub fn swap_node_children_at(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    index1: usize,
    index2: usize,
) {
    let count = arena[target].children.len();
    if index1 == index2 || count == 0 {
        return;
    }
    assert!(index1 < count && index2 < count, "Index out of bounds");
    arena[target].children.swap(index1, index2);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn new_arena() -> NodeArena<HierarchyNode> {
        NodeArena::new()
    }

    fn insert(arena: &mut NodeArena<HierarchyNode>) -> NodeId {
        arena.insert(HierarchyNode::default())
    }

    // add_node_child

    #[test]
    fn add_node_child_appends_to_front() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        assert_eq!(arena[parent].children, vec![c0, c1]);
        assert_eq!(arena[c0].parent, Some(parent));
        assert_eq!(arena[c1].parent, Some(parent));
    }

    #[test]
    #[should_panic(expected = "cannot be added as a child of itself")]
    fn add_node_child_self_panics() {
        let mut arena = new_arena();
        let n = insert(&mut arena);
        add_node_child(&mut arena, n, n);
    }

    // add_node_child_at

    #[test]
    fn add_node_child_at_inserts_at_index() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        let c2 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        add_node_child_at(&mut arena, parent, c2, 1);
        assert_eq!(arena[parent].children, vec![c0, c2, c1]);
    }

    #[test]
    fn add_node_child_at_moves_existing_child() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        let c2 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        add_node_child(&mut arena, parent, c2);
        // move c0 to index 2
        add_node_child_at(&mut arena, parent, c0, 2);
        assert_eq!(arena[parent].children, vec![c1, c2, c0]);
    }

    #[test]
    fn add_node_child_reparents_from_old_parent() {
        let mut arena = new_arena();
        let p1 = insert(&mut arena);
        let p2 = insert(&mut arena);
        let child = insert(&mut arena);
        add_node_child(&mut arena, p1, child);
        assert_eq!(arena[child].parent, Some(p1));
        add_node_child(&mut arena, p2, child);
        assert_eq!(arena[child].parent, Some(p2));
        assert!(arena[p1].children.is_empty());
        assert_eq!(arena[p2].children, vec![child]);
    }

    // contains_node_child

    #[test]
    fn contains_node_child_direct_and_indirect() {
        let mut arena = new_arena();
        let root = insert(&mut arena);
        let mid = insert(&mut arena);
        let leaf = insert(&mut arena);
        add_node_child(&mut arena, root, mid);
        add_node_child(&mut arena, mid, leaf);
        assert!(contains_node_child(&arena, root, mid));
        assert!(contains_node_child(&arena, root, leaf));
        assert!(contains_node_child(&arena, root, root)); // self
        assert!(!contains_node_child(&arena, mid, root));
    }

    // detach_node

    #[test]
    fn detach_node_removes_from_parent() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_node_child(&mut arena, parent, child);
        detach_node(&mut arena, child);
        assert!(arena[child].parent.is_none());
        assert!(arena[parent].children.is_empty());
    }

    #[test]
    fn detach_node_noop_for_root() {
        let mut arena = new_arena();
        let node = insert(&mut arena);
        detach_node(&mut arena, node); // should not panic
        assert!(arena[node].parent.is_none());
    }

    // get_node_child_at

    #[test]
    fn get_node_child_at_returns_none_for_out_of_range() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        assert_eq!(get_node_child_at(&arena, parent, 0), None);
        let child = insert(&mut arena);
        add_node_child(&mut arena, parent, child);
        assert_eq!(get_node_child_at(&arena, parent, 0), Some(child));
        assert_eq!(get_node_child_at(&arena, parent, 1), None);
    }

    // get_node_child_by_name

    #[test]
    fn get_node_child_by_name_returns_first_match() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        let c2 = insert(&mut arena);
        arena[c0].name = Some("a".to_string());
        arena[c1].name = Some("target".to_string());
        arena[c2].name = Some("target".to_string());
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        add_node_child(&mut arena, parent, c2);
        // First matching child (c1) is returned, not c2.
        assert_eq!(get_node_child_by_name(&arena, parent, "target"), Some(c1));
        assert_eq!(get_node_child_by_name(&arena, parent, "a"), Some(c0));
        assert_eq!(get_node_child_by_name(&arena, parent, "missing"), None);
    }

    // get_node_child_count

    #[test]
    fn get_node_child_count_empty_and_populated() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        assert_eq!(get_node_child_count(&arena, parent), 0);
        let c = insert(&mut arena);
        add_node_child(&mut arena, parent, c);
        assert_eq!(get_node_child_count(&arena, parent), 1);
    }

    // get_node_children

    #[test]
    fn get_node_children_clones_list() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        let children = get_node_children(&arena, parent);
        assert_eq!(children, vec![c0, c1]);
    }

    // get_node_child_index

    #[test]
    fn get_node_child_index_finds_position() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        assert_eq!(get_node_child_index(&arena, parent, c0), Some(0));
        assert_eq!(get_node_child_index(&arena, parent, c1), Some(1));
        let other = insert(&mut arena);
        assert_eq!(get_node_child_index(&arena, parent, other), None);
    }

    // get_node_depth

    #[test]
    fn get_node_depth_measures_levels() {
        let mut arena = new_arena();
        let root = insert(&mut arena);
        let mid = insert(&mut arena);
        let leaf = insert(&mut arena);
        add_node_child(&mut arena, root, mid);
        add_node_child(&mut arena, mid, leaf);
        assert_eq!(get_node_depth(&arena, root), 0);
        assert_eq!(get_node_depth(&arena, mid), 1);
        assert_eq!(get_node_depth(&arena, leaf), 2);
    }

    // get_node_parent

    #[test]
    fn get_node_parent_none_for_root() {
        let mut arena = new_arena();
        let root = insert(&mut arena);
        assert_eq!(get_node_parent(&arena, root), None);
    }

    // get_node_root

    #[test]
    fn get_node_root_returns_topmost_ancestor() {
        let mut arena = new_arena();
        let root = insert(&mut arena);
        let mid = insert(&mut arena);
        let leaf = insert(&mut arena);
        add_node_child(&mut arena, root, mid);
        add_node_child(&mut arena, mid, leaf);
        assert_eq!(get_node_root(&arena, leaf), root);
        assert_eq!(get_node_root(&arena, root), root);
    }

    // remove_node_child

    #[test]
    fn remove_node_child_clears_parent() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        add_node_child(&mut arena, parent, child);
        remove_node_child(&mut arena, parent, child);
        assert!(arena[child].parent.is_none());
        assert!(arena[parent].children.is_empty());
    }

    #[test]
    fn remove_node_child_noop_for_non_child() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let other = insert(&mut arena);
        remove_node_child(&mut arena, parent, other); // should not panic
    }

    // remove_node_child_at

    #[test]
    fn remove_node_child_at_removes_by_index() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        let removed = remove_node_child_at(&mut arena, parent, 0);
        assert_eq!(removed, Some(c0));
        assert_eq!(arena[parent].children, vec![c1]);
    }

    #[test]
    fn remove_node_child_at_returns_none_out_of_range() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        assert_eq!(remove_node_child_at(&mut arena, parent, 0), None);
    }

    // remove_node_children

    #[test]
    fn remove_node_children_range() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        let c2 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        add_node_child(&mut arena, parent, c2);
        remove_node_children(&mut arena, parent, 0, Some(1));
        assert_eq!(arena[parent].children, vec![c2]);
        assert!(arena[c0].parent.is_none());
        assert!(arena[c1].parent.is_none());
    }

    // set_node_child_index

    #[test]
    fn set_node_child_index_reorders() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        let c2 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        add_node_child(&mut arena, parent, c2);
        set_node_child_index(&mut arena, parent, c0, 2);
        assert_eq!(arena[parent].children, vec![c1, c2, c0]);
    }

    // swap_node_children

    #[test]
    fn swap_node_children_swaps_positions() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        let c2 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        add_node_child(&mut arena, parent, c2);
        swap_node_children(&mut arena, parent, c0, c2);
        assert_eq!(arena[parent].children, vec![c2, c1, c0]);
    }

    #[test]
    fn swap_node_children_noop_for_non_children() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let child = insert(&mut arena);
        let other = insert(&mut arena);
        add_node_child(&mut arena, parent, child);
        // other is not a child — should not panic
        swap_node_children(&mut arena, parent, child, other);
        assert_eq!(arena[parent].children, vec![child]);
    }

    // swap_node_children_at

    #[test]
    fn swap_node_children_at_swaps_by_index() {
        let mut arena = new_arena();
        let parent = insert(&mut arena);
        let c0 = insert(&mut arena);
        let c1 = insert(&mut arena);
        add_node_child(&mut arena, parent, c0);
        add_node_child(&mut arena, parent, c1);
        swap_node_children_at(&mut arena, parent, 0, 1);
        assert_eq!(arena[parent].children, vec![c1, c0]);
    }
}
