use crate::hierarchy::{HierarchyNode, get_node_child_index, get_node_parent};
use crate::node_id::{NodeArena, NodeId};

pub fn find_node(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    predicate: &dyn Fn(NodeId) -> bool,
) -> Option<NodeId> {
    let children = arena[source].children.clone();
    for child in &children {
        if predicate(*child) {
            return Some(*child);
        }
        if let Some(found) = find_node(arena, *child, predicate) {
            return Some(found);
        }
    }
    None
}

pub fn find_node_by_name(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    name: &str,
) -> Option<NodeId> {
    find_node(arena, source, &|id| arena[id].name.as_deref() == Some(name))
}

pub fn for_each_node_ancestor(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    callback: &mut dyn FnMut(NodeId) -> bool,
) {
    let mut current = get_node_parent(arena, source);
    while let Some(parent) = current {
        if !callback(parent) {
            return;
        }
        current = get_node_parent(arena, parent);
    }
}

pub fn for_each_node_child(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    callback: &mut dyn FnMut(NodeId, usize) -> bool,
) {
    let children = arena[source].children.clone();
    for (i, child) in children.iter().enumerate() {
        if !callback(*child, i) {
            return;
        }
    }
}

pub fn for_each_node_descendant(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    callback: &mut dyn FnMut(NodeId),
) {
    let children = arena[source].children.clone();
    for child in &children {
        callback(*child);
        for_each_node_descendant(arena, *child, callback);
    }
}

pub fn get_node_ancestors(arena: &NodeArena<HierarchyNode>, source: NodeId) -> Vec<NodeId> {
    let mut result = Vec::new();
    let mut current = get_node_parent(arena, source);
    while let Some(parent) = current {
        result.push(parent);
        current = get_node_parent(arena, parent);
    }
    result
}

pub fn get_node_common_ancestor(
    arena: &NodeArena<HierarchyNode>,
    a: NodeId,
    b: NodeId,
) -> Option<NodeId> {
    let mut a_ancestors = std::collections::HashSet::new();
    a_ancestors.insert(a);
    let mut cur = get_node_parent(arena, a);
    while let Some(p) = cur {
        a_ancestors.insert(p);
        cur = get_node_parent(arena, p);
    }

    let mut b_cur = Some(b);
    while let Some(node) = b_cur {
        if a_ancestors.contains(&node) {
            return Some(node);
        }
        b_cur = get_node_parent(arena, node);
    }
    None
}

pub fn get_node_next_sibling(arena: &NodeArena<HierarchyNode>, source: NodeId) -> Option<NodeId> {
    let parent = get_node_parent(arena, source)?;
    let siblings = &arena[parent].children;
    let idx = siblings.iter().position(|&id| id == source)?;
    if idx + 1 < siblings.len() {
        Some(siblings[idx + 1])
    } else {
        None
    }
}

pub fn get_node_previous_sibling(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
) -> Option<NodeId> {
    let parent = get_node_parent(arena, source)?;
    let siblings = &arena[parent].children;
    let idx = siblings.iter().position(|&id| id == source)?;
    if idx > 0 {
        Some(siblings[idx - 1])
    } else {
        None
    }
}

pub fn is_node_ancestor_of(
    arena: &NodeArena<HierarchyNode>,
    ancestor: NodeId,
    descendant: NodeId,
) -> bool {
    let mut current = Some(descendant);
    while let Some(node) = current {
        if node == ancestor {
            return true;
        }
        current = get_node_parent(arena, node);
    }
    false
}

pub fn replace_node_child(
    arena: &mut NodeArena<HierarchyNode>,
    target: NodeId,
    old_child: NodeId,
    new_child: NodeId,
) {
    let index = match get_node_child_index(arena, target, old_child) {
        Some(i) => i,
        None => return,
    };
    crate::hierarchy::remove_node_child(arena, target, old_child);
    crate::hierarchy::add_node_child_at(arena, target, new_child, index);
}

pub fn walk_node_descendants(
    arena: &NodeArena<HierarchyNode>,
    source: NodeId,
    visit: &mut dyn FnMut(NodeId) -> bool,
) -> bool {
    let children = arena[source].children.clone();
    for child in &children {
        if !visit(*child) {
            return false;
        }
        if !walk_node_descendants(arena, *child, visit) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hierarchy::{HierarchyNode, add_node_child};

    fn new_arena_with_tree() -> (NodeArena<HierarchyNode>, NodeId, NodeId, NodeId, NodeId) {
        let mut arena = NodeArena::with_key();
        let root = arena.insert(HierarchyNode {
            name: Some("root".into()),
            ..Default::default()
        });
        let a = arena.insert(HierarchyNode {
            name: Some("a".into()),
            ..Default::default()
        });
        let b = arena.insert(HierarchyNode {
            name: Some("b".into()),
            ..Default::default()
        });
        let c = arena.insert(HierarchyNode {
            name: Some("c".into()),
            ..Default::default()
        });
        add_node_child(&mut arena, root, a);
        add_node_child(&mut arena, root, b);
        add_node_child(&mut arena, a, c);
        (arena, root, a, b, c)
    }

    #[test]
    fn test_find_node() {
        let (arena, root, _a, b, _c) = new_arena_with_tree();
        let found = find_node(&arena, root, &|id| arena[id].name.as_deref() == Some("b"));
        assert_eq!(found, Some(b));
    }

    #[test]
    fn test_find_node_by_name() {
        let (arena, root, _a, _b, c) = new_arena_with_tree();
        let found = find_node_by_name(&arena, root, "c");
        assert_eq!(found, Some(c));
    }

    #[test]
    fn test_get_node_ancestors() {
        let (arena, root, a, _b, c) = new_arena_with_tree();
        let ancestors = get_node_ancestors(&arena, c);
        assert_eq!(ancestors, vec![a, root]);
    }

    #[test]
    fn test_get_node_common_ancestor() {
        let (arena, root, a, b, c) = new_arena_with_tree();
        assert_eq!(get_node_common_ancestor(&arena, c, b), Some(root));
        assert_eq!(get_node_common_ancestor(&arena, c, a), Some(a));
    }

    #[test]
    fn test_get_node_next_sibling() {
        let (arena, _root, a, b, _c) = new_arena_with_tree();
        assert_eq!(get_node_next_sibling(&arena, a), Some(b));
        assert_eq!(get_node_next_sibling(&arena, b), None);
    }

    #[test]
    fn test_get_node_previous_sibling() {
        let (arena, _root, a, b, _c) = new_arena_with_tree();
        assert_eq!(get_node_previous_sibling(&arena, b), Some(a));
        assert_eq!(get_node_previous_sibling(&arena, a), None);
    }

    #[test]
    fn test_is_node_ancestor_of() {
        let (arena, root, a, _b, c) = new_arena_with_tree();
        assert!(is_node_ancestor_of(&arena, root, c));
        assert!(is_node_ancestor_of(&arena, a, c));
        assert!(!is_node_ancestor_of(&arena, c, root));
    }

    #[test]
    fn test_walk_node_descendants() {
        let (arena, root, a, b, c) = new_arena_with_tree();
        let mut visited = Vec::new();
        walk_node_descendants(&arena, root, &mut |id| {
            visited.push(id);
            true
        });
        assert_eq!(visited, vec![a, c, b]);
    }

    #[test]
    fn test_replace_node_child() {
        let (mut arena, root, a, b, _c) = new_arena_with_tree();
        let d = arena.insert(HierarchyNode::default());
        replace_node_child(&mut arena, root, a, d);
        assert_eq!(arena[root].children, vec![d, b]);
    }
}
