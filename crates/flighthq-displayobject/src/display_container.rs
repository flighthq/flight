//! Display container — a display object that acts as a parent for other
//! display objects.
//!
//! Hierarchy operations (add child, remove child, swap, …) delegate to the
//! spatial hierarchy stored on each `DisplayObjectNode`.

use flighthq_node::NodeId;
use flighthq_types::display_object_kind;

use crate::display_object::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
    create_display_object_runtime, get_display_object_runtime,
};

// ---------------------------------------------------------------------------
// create_display_container
// ---------------------------------------------------------------------------

/// Inserts a new display container node into `arena` and returns its id.
///
/// A container is structurally identical to a base display object — it uses the
/// same kind — but callers use it as a parent for other display objects.
pub fn create_display_container(arena: &mut DisplayObjectArena) -> NodeId {
    create_display_object_generic(arena, display_object_kind(), None)
}

// ---------------------------------------------------------------------------
// create_display_container_runtime
// ---------------------------------------------------------------------------

/// Builds the runtime behavior for a display container.
///
/// Mirrors TS `createDisplayContainerRuntime()`, which delegates to
/// `createDisplayObjectRuntime()` with no compute method — a container has no
/// intrinsic content, so its bounds derive from its children.
pub fn create_display_container_runtime() -> DisplayObjectRuntime {
    create_display_object_runtime(None)
}

// ---------------------------------------------------------------------------
// get_display_container_runtime
// ---------------------------------------------------------------------------

/// Returns the runtime behavior for the display container at `source`.
///
/// Mirrors TS `getDisplayContainerRuntime(source)`.
pub fn get_display_container_runtime(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> DisplayObjectRuntime {
    get_display_object_runtime(arena, source)
}

// ---------------------------------------------------------------------------
// add_display_object_child
// ---------------------------------------------------------------------------

/// Adds `child` to the end of `target`'s child list.
///
/// If `child` already has a parent it is detached first.
///
/// # Panics
/// Panics if `child == target`.
pub fn add_display_object_child(arena: &mut DisplayObjectArena, target: NodeId, child: NodeId) {
    let count = arena[target].spatial.hierarchy.children.len();
    add_display_object_child_at(arena, target, child, count);
}

// ---------------------------------------------------------------------------
// add_display_object_child_at
// ---------------------------------------------------------------------------

/// Inserts `child` at `index` in `target`'s child list.
///
/// # Panics
/// Panics if `child == target` or `index > child_count`.
pub fn add_display_object_child_at(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    child: NodeId,
    index: usize,
) {
    assert_ne!(target, child, "A node cannot be added as a child of itself");
    let child_count = arena[target].spatial.hierarchy.children.len();
    assert!(index <= child_count, "Index {index} out of bounds");

    let current_parent = arena[child].spatial.hierarchy.parent;
    if current_parent == Some(target) {
        let pos = arena[target]
            .spatial
            .hierarchy
            .children
            .iter()
            .position(|&id| id == child);
        if let Some(pos) = pos {
            if pos == index {
                return;
            }
            arena[target].spatial.hierarchy.children.remove(pos);
            let adj = if index > pos { index - 1 } else { index };
            arena[target].spatial.hierarchy.children.insert(adj, child);
        }
    } else {
        if let Some(old_parent) = current_parent {
            arena[old_parent]
                .spatial
                .hierarchy
                .children
                .retain(|&id| id != child);
        }
        arena[target]
            .spatial
            .hierarchy
            .children
            .insert(index, child);
        arena[child].spatial.hierarchy.parent = Some(target);
    }
}

// ---------------------------------------------------------------------------
// contains_display_object_child
// ---------------------------------------------------------------------------

/// Returns `true` if `child` is `source` or any descendant of `source`.
pub fn contains_display_object_child(
    arena: &DisplayObjectArena,
    source: NodeId,
    child: NodeId,
) -> bool {
    let mut current = child;
    loop {
        if current == source {
            return true;
        }
        match arena[current].spatial.hierarchy.parent {
            Some(p) => current = p,
            None => return false,
        }
    }
}

// ---------------------------------------------------------------------------
// detach_display_object
// ---------------------------------------------------------------------------

/// Detaches `node` from its current parent, if any.
pub fn detach_display_object(arena: &mut DisplayObjectArena, node: NodeId) {
    if let Some(parent) = arena[node].spatial.hierarchy.parent {
        remove_display_object_child(arena, parent, node);
    }
}

// ---------------------------------------------------------------------------
// get_display_object_child_at
// ---------------------------------------------------------------------------

/// Returns the child at `index`, or `None` if out of range.
pub fn get_display_object_child_at(
    arena: &DisplayObjectArena,
    source: NodeId,
    index: usize,
) -> Option<NodeId> {
    arena[source].spatial.hierarchy.children.get(index).copied()
}

// ---------------------------------------------------------------------------
// get_display_object_child_count
// ---------------------------------------------------------------------------

/// Returns the number of direct children.
pub fn get_display_object_child_count(arena: &DisplayObjectArena, source: NodeId) -> usize {
    arena[source].spatial.hierarchy.children.len()
}

// ---------------------------------------------------------------------------
// get_display_object_child_index
// ---------------------------------------------------------------------------

/// Returns the index of `child` in `source`'s child list, or `None`.
pub fn get_display_object_child_index(
    arena: &DisplayObjectArena,
    source: NodeId,
    child: NodeId,
) -> Option<usize> {
    arena[source]
        .spatial
        .hierarchy
        .children
        .iter()
        .position(|&id| id == child)
}

// ---------------------------------------------------------------------------
// get_display_object_children
// ---------------------------------------------------------------------------

/// Returns a snapshot of `source`'s direct children.
pub fn get_display_object_children(arena: &DisplayObjectArena, source: NodeId) -> Vec<NodeId> {
    arena[source].spatial.hierarchy.children.clone()
}

// ---------------------------------------------------------------------------
// get_display_object_depth
// ---------------------------------------------------------------------------

/// Returns the depth of `source` in the tree (root = 0).
pub fn get_display_object_depth(arena: &DisplayObjectArena, source: NodeId) -> usize {
    let mut depth = 0;
    let mut current = source;
    while let Some(parent) = arena[current].spatial.hierarchy.parent {
        depth += 1;
        current = parent;
    }
    depth
}

// ---------------------------------------------------------------------------
// get_display_object_parent
// ---------------------------------------------------------------------------

/// Returns the parent of `source`, or `None` if it is a root.
pub fn get_display_object_parent(arena: &DisplayObjectArena, source: NodeId) -> Option<NodeId> {
    arena[source].spatial.hierarchy.parent
}

// ---------------------------------------------------------------------------
// get_display_object_root
// ---------------------------------------------------------------------------

/// Returns the topmost ancestor of `source`, or `source` itself if it has no parent.
pub fn get_display_object_root(arena: &DisplayObjectArena, source: NodeId) -> NodeId {
    let mut current = source;
    while let Some(parent) = arena[current].spatial.hierarchy.parent {
        current = parent;
    }
    current
}

// ---------------------------------------------------------------------------
// remove_display_object_child
// ---------------------------------------------------------------------------

/// Removes `child` from `target`'s child list and clears `child`'s parent.
pub fn remove_display_object_child(arena: &mut DisplayObjectArena, target: NodeId, child: NodeId) {
    if arena[child].spatial.hierarchy.parent != Some(target) {
        return;
    }
    arena[child].spatial.hierarchy.parent = None;
    arena[target]
        .spatial
        .hierarchy
        .children
        .retain(|&id| id != child);
}

// ---------------------------------------------------------------------------
// remove_display_object_child_at
// ---------------------------------------------------------------------------

/// Removes the child at `index` from `target`'s child list.
///
/// Returns the removed child's id, or `None` if `index` is out of range.
pub fn remove_display_object_child_at(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    index: usize,
) -> Option<NodeId> {
    let children = &arena[target].spatial.hierarchy.children;
    if index >= children.len() {
        return None;
    }
    let child = children[index];
    remove_display_object_child(arena, target, child);
    Some(child)
}

// ---------------------------------------------------------------------------
// remove_display_object_children
// ---------------------------------------------------------------------------

/// Removes all children from `target`.
pub fn remove_display_object_children(arena: &mut DisplayObjectArena, target: NodeId) {
    let children: Vec<NodeId> = arena[target].spatial.hierarchy.children.clone();
    for child in children {
        arena[child].spatial.hierarchy.parent = None;
    }
    arena[target].spatial.hierarchy.children.clear();
}

// ---------------------------------------------------------------------------
// set_display_object_child_index
// ---------------------------------------------------------------------------

/// Moves `child` to `index` within `target`'s child list.
///
/// No-op if `child` is not a child of `target`.
pub fn set_display_object_child_index(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    child: NodeId,
    index: usize,
) {
    if arena[child].spatial.hierarchy.parent != Some(target) {
        return;
    }
    let children = &mut arena[target].spatial.hierarchy.children;
    let Some(pos) = children.iter().position(|&id| id == child) else {
        return;
    };
    let clamped = index.min(children.len() - 1);
    children.remove(pos);
    let adj = if clamped > pos { clamped - 1 } else { clamped };
    children.insert(adj, child);
}

// ---------------------------------------------------------------------------
// swap_display_object_children
// ---------------------------------------------------------------------------

/// Swaps the positions of `child1` and `child2` in `target`'s child list.
pub fn swap_display_object_children(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    child1: NodeId,
    child2: NodeId,
) {
    if arena[child1].spatial.hierarchy.parent != Some(target)
        || arena[child2].spatial.hierarchy.parent != Some(target)
    {
        return;
    }
    let children = &mut arena[target].spatial.hierarchy.children;
    let i1 = children.iter().position(|&id| id == child1);
    let i2 = children.iter().position(|&id| id == child2);
    if let (Some(i1), Some(i2)) = (i1, i2) {
        children.swap(i1, i2);
    }
}

// ---------------------------------------------------------------------------
// swap_display_object_children_at
// ---------------------------------------------------------------------------

/// Swaps the children at positions `index1` and `index2` in `target`'s child list.
pub fn swap_display_object_children_at(
    arena: &mut DisplayObjectArena,
    target: NodeId,
    index1: usize,
    index2: usize,
) {
    let children = &mut arena[target].spatial.hierarchy.children;
    if index1 < children.len() && index2 < children.len() {
        children.swap(index1, index2);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::display_object::create_display_object;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    // create_display_container

    #[test]
    fn create_display_container_uses_display_object_kind() {
        let mut arena = new_arena();
        let id = create_display_container(&mut arena);
        assert_eq!(arena[id].kind, display_object_kind());
        assert_eq!(get_display_object_child_count(&arena, id), 0);
    }

    // create_display_container_runtime

    #[test]
    fn create_display_container_runtime_has_no_compute() {
        // TS: container runtime carries no bounds-compute method.
        let runtime = create_display_container_runtime();
        assert!(runtime.is_none());
    }

    // get_display_container_runtime

    #[test]
    fn get_display_container_runtime_is_none() {
        let mut arena = new_arena();
        let id = create_display_container(&mut arena);
        assert!(get_display_container_runtime(&arena, id).is_none());
    }

    // add_display_object_child / remove_display_object_child

    #[test]
    fn add_and_remove_child() {
        let mut arena = new_arena();
        let parent = create_display_container(&mut arena);
        let child = create_display_object(&mut arena);
        add_display_object_child(&mut arena, parent, child);
        assert_eq!(get_display_object_child_count(&arena, parent), 1);
        assert_eq!(get_display_object_parent(&arena, child), Some(parent));
        remove_display_object_child(&mut arena, parent, child);
        assert_eq!(get_display_object_child_count(&arena, parent), 0);
        assert!(get_display_object_parent(&arena, child).is_none());
    }

    // add_display_object_child_at

    #[test]
    fn add_child_at_inserts_at_index() {
        let mut arena = new_arena();
        let parent = create_display_container(&mut arena);
        let c0 = create_display_object(&mut arena);
        let c1 = create_display_object(&mut arena);
        add_display_object_child(&mut arena, parent, c0);
        add_display_object_child_at(&mut arena, parent, c1, 0);
        assert_eq!(get_display_object_child_at(&arena, parent, 0), Some(c1));
        assert_eq!(get_display_object_child_at(&arena, parent, 1), Some(c0));
    }

    // contains_display_object_child

    #[test]
    fn contains_display_object_child_deep() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let mid = create_display_container(&mut arena);
        let leaf = create_display_object(&mut arena);
        add_display_object_child(&mut arena, root, mid);
        add_display_object_child(&mut arena, mid, leaf);
        assert!(contains_display_object_child(&arena, root, leaf));
        assert!(!contains_display_object_child(&arena, leaf, root));
    }

    // detach_display_object

    #[test]
    fn detach_display_object_makes_root() {
        let mut arena = new_arena();
        let parent = create_display_container(&mut arena);
        let child = create_display_object(&mut arena);
        add_display_object_child(&mut arena, parent, child);
        detach_display_object(&mut arena, child);
        assert!(get_display_object_parent(&arena, child).is_none());
        assert_eq!(get_display_object_child_count(&arena, parent), 0);
    }

    // get_display_object_root

    #[test]
    fn get_display_object_root_walks_to_top() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let mid = create_display_container(&mut arena);
        let leaf = create_display_object(&mut arena);
        add_display_object_child(&mut arena, root, mid);
        add_display_object_child(&mut arena, mid, leaf);
        assert_eq!(get_display_object_root(&arena, leaf), root);
    }

    // remove_display_object_children

    #[test]
    fn remove_display_object_children_clears_all() {
        let mut arena = new_arena();
        let parent = create_display_container(&mut arena);
        let c0 = create_display_object(&mut arena);
        let c1 = create_display_object(&mut arena);
        add_display_object_child(&mut arena, parent, c0);
        add_display_object_child(&mut arena, parent, c1);
        remove_display_object_children(&mut arena, parent);
        assert_eq!(get_display_object_child_count(&arena, parent), 0);
    }

    // swap_display_object_children

    #[test]
    fn swap_display_object_children_reorders() {
        let mut arena = new_arena();
        let parent = create_display_container(&mut arena);
        let c0 = create_display_object(&mut arena);
        let c1 = create_display_object(&mut arena);
        add_display_object_child(&mut arena, parent, c0);
        add_display_object_child(&mut arena, parent, c1);
        swap_display_object_children(&mut arena, parent, c0, c1);
        assert_eq!(get_display_object_child_at(&arena, parent, 0), Some(c1));
        assert_eq!(get_display_object_child_at(&arena, parent, 1), Some(c0));
    }
}
