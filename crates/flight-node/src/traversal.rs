//! Depth-first descendant traversal and sibling queries (TS `traversal.ts`).

// flight-lint: allow-file(contract-vocabulary) D16 open node trait objects are contract dispatch, not vocabulary types

use crate::hierarchy::get_node_parent;
use crate::node::get_node_runtime;
use crate::types::*;

/// Finds the first descendant (depth-first pre-order) matching `predicate` (TS `findNode`).
pub fn find_node(source: &NodeRef, predicate: &mut dyn FnMut(&NodeRef) -> bool) -> Option<NodeRef> {
    let children = get_node_runtime(&*source.read().unwrap()).children.clone();
    let children = children?;
    for child in children {
        if predicate(&child) {
            return Some(child);
        }
        if let Some(found) = find_node(&child, predicate) {
            return Some(found);
        }
    }
    return None;
}

/// Finds the first descendant with `name` (TS `findNodeByName`); searches the full subtree.
pub fn find_node_by_name(source: &NodeRef, name: &str) -> Option<NodeRef> {
    return find_node(source, &mut |node: &NodeRef| {
        let guard = node.read().unwrap();
        return guard.node_fields().name.as_deref() == Some(name);
    });
}

/// Calls `callback` for each ancestor toward the root; `false` stops early
/// (TS `forEachNodeAncestor`).
pub fn for_each_node_ancestor(source: &NodeRef, callback: &mut dyn FnMut(&NodeRef) -> bool) {
    let mut current = get_node_parent(source);
    while let Some(node) = current {
        if !callback(&node) {
            return;
        }
        current = get_node_parent(&node);
    }
}

/// Calls `callback` for every descendant in depth-first pre-order (TS `forEachNodeDescendant`).
pub fn for_each_node_descendant(source: &NodeRef, callback: &mut dyn FnMut(&NodeRef)) {
    let children = get_node_runtime(&*source.read().unwrap()).children.clone();
    if let Some(children) = children {
        for child in children {
            callback(&child);
            for_each_node_descendant(&child, callback);
        }
    }
}

/// A snapshot of the direct children, safe to iterate while the graph mutates
/// (TS `getNodeChildren`).
pub fn get_node_children(source: &NodeRef) -> Vec<NodeRef> {
    return get_node_runtime(&*source.read().unwrap())
        .children
        .clone()
        .unwrap_or_default();
}

/// The node's depth: 0 for a root, 1 for its child, and so on (TS `getNodeDepth`).
pub fn get_node_depth(source: &NodeRef) -> usize {
    let mut depth = 0;
    let mut current = get_node_parent(source);
    while let Some(node) = current {
        depth += 1;
        current = get_node_parent(&node);
    }
    return depth;
}

/// The next sibling, or null (TS `getNodeNextSibling`).
pub fn get_node_next_sibling(source: &NodeRef) -> Option<NodeRef> {
    let parent = get_node_parent(source)?;
    let siblings = get_node_runtime(&*parent.read().unwrap())
        .children
        .clone()?;
    let index = siblings
        .iter()
        .position(|sibling| node_identity_eq(sibling, source))?;
    return siblings.get(index + 1).cloned();
}

/// The previous sibling, or null (TS `getNodePreviousSibling`).
pub fn get_node_previous_sibling(source: &NodeRef) -> Option<NodeRef> {
    let parent = get_node_parent(source)?;
    let siblings = get_node_runtime(&*parent.read().unwrap())
        .children
        .clone()?;
    let index = siblings
        .iter()
        .position(|sibling| node_identity_eq(sibling, source))?;
    if index == 0 {
        return None;
    }
    return siblings.get(index - 1).cloned();
}

fn node_identity_eq(left: &NodeRef, right: &NodeRef) -> bool {
    return std::sync::Arc::ptr_eq(left, right);
}

/// Walks descendants depth-first pre-order; `visit` returning false stops the walk.
/// Returns true when the walk completed (TS `walkNodeDescendants`).
pub fn walk_node_descendants(source: &NodeRef, visit: &mut dyn FnMut(&NodeRef) -> bool) -> bool {
    let children = get_node_runtime(&*source.read().unwrap()).children.clone();
    let Some(children) = children else {
        return true;
    };
    for child in children {
        if !visit(&child) {
            return false;
        }
        if !walk_node_descendants(&child, visit) {
            return false;
        }
    }
    return true;
}
