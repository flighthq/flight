//! Node graph hierarchy: attachment, ordering, traversal of ancestors and child lists
//! (TS `hierarchy.ts`).

// flight-lint: allow-file(contract-vocabulary, conform-params) D16 open node trait objects are contract dispatch; D5 caller-owned guard and revision state replace TS module-level state

use std::sync::Arc;

use flight_geometry::Transform2D;
use flight_geometry::{
    Matrix, copy_matrix, create_matrix, decompose_matrix_to_transform2d, inverse_matrix,
    multiply_matrix,
};
use flight_signals::emit_signal;

use crate::node::get_node_runtime;
use crate::node_transform2d::{ensure_node_world_matrix, get_node_world_matrix};
use crate::revision::{
    NodeRevisionState, invalidate_node_local_transform, invalidate_node_parent_reference,
    invalidate_node_world_bounds,
};
use crate::types::*;

/// Fallback diagnostics for a declined reparent (TS `reparentNodeGuard`), caller-owned per D5.
pub type NodeReparentGuard = Arc<dyn Fn(&dyn Node, &dyn Node) + Send + Sync>;

/// Caller-owned guard state installed by `enable_node_guards` (D5).
#[derive(Clone, Default)]
pub struct NodeGuardState {
    pub reparent_node_guard: Option<NodeReparentGuard>,
}

/// Adds a child at the top of the child list (TS `addNodeChild`).

pub fn add_node_child(target: &NodeRef, child: &NodeRef) -> NodeRef {
    return add_node_child_at(target, child, get_node_child_count(target) as i32);
}

/// Adds a child at `index`; index 0 is the back of the display list (TS `addNodeChildAt`).

pub fn add_node_child_at(target: &NodeRef, child: &NodeRef, index: i32) -> NodeRef {
    if node_arc_eq(target, child) {
        panic!("An object cannot be added as a child of itself");
    }
    if is_node_ancestor_of(child, target) {
        panic!("An ancestor cannot be added as a child of its descendant");
    }
    let child_count = get_node_child_count(target) as i32;
    if index < 0 || index > child_count {
        throw_out_of_bounds_error();
    }
    if !can_add_child(target, child) {
        panic!("The specified parent object cannot add this child");
    }

    let parent = get_node_parent(child);
    let parent_is_target = parent
        .as_ref()
        .map(|parent| node_arc_eq(parent, target))
        .unwrap_or(false);
    let current_index = if parent_is_target {
        get_node_child_index(target, child)
    } else {
        -1
    };
    let was_child = parent_is_target && current_index != -1;
    if was_child {
        let destination = index.min(child_count - 1);
        if current_index == destination {
            return child.clone();
        }
    }
    if !parent_is_target && let Some(parent) = &parent {
        remove_node_child(parent, child);
    }

    {
        let mut guard = target.write().unwrap();
        let runtime = guard.node_runtime_mut();
        if runtime.children.is_none() {
            runtime.children = Some(Vec::new());
        }
        let children = runtime.children.as_mut().expect("children are allocated");
        if let Some(current_index) = children.iter().position(|entry| node_arc_eq(entry, child)) {
            children.remove(current_index);
        }
        children.insert(index as usize, child.clone());
        runtime.children_id = runtime.children_id.wrapping_add(1);
    }
    if !was_child {
        invalidate_node_world_bounds(target);
    }
    emit_unit_signal(target, |signals| signals.on_children_changed.clone());

    if !parent_is_target {
        child.write().unwrap().node_runtime_mut().parent = Some(Arc::downgrade(target));
        emit_node_signal(target, |signals| signals.on_child_added.clone(), child);
        emit_unit_signal(child, |signals| signals.on_parent_changed.clone());
        invalidate_node_parent_reference(child);
    }
    return child.clone();
}

/// Adds each child in order, emitting per child (TS `addNodeChildren`).

pub fn add_node_children(target: &NodeRef, children: &[NodeRef]) {
    for child in children {
        add_node_child(target, child);
    }
}

/// True when `child` is a child of `source` or the instance itself (TS `containsNodeChild`).

fn can_add_child(target: &NodeRef, child: &NodeRef) -> bool {
    let can_add = target.read().unwrap().node_runtime().can_add_child.clone();
    let target_guard = target.read().unwrap();
    let child_guard = child.read().unwrap();
    return can_add(&*target_guard, &*child_guard);
}

pub fn contains_node_child(source: &NodeRef, child: &NodeRef) -> bool {
    let mut current = Some(child.clone());
    while let Some(node) = current {
        if node_arc_eq(&node, source) {
            return true;
        }
        current = get_node_parent(&node);
    }
    return false;
}

/// Calls `callback` for each direct child in index order; `false` stops early
/// (TS `forEachNodeChild`).

fn emit_node_signal<T>(
    target: &NodeRef,
    pick: impl Fn(&NodeSignals) -> flight_signals::Signal<T>,
    value: &T,
) {
    let signals = target.read().unwrap().node_runtime().node_signals.clone();
    if let Some(signals) = signals {
        let signal = {
            let guard = signals.read().unwrap();
            pick(&*guard)
        };
        emit_signal(&signal, value);
    }
}

fn emit_unit_signal(target: &NodeRef, pick: impl Fn(&NodeSignals) -> flight_signals::Signal<()>) {
    let signals = target.read().unwrap().node_runtime().node_signals.clone();
    if let Some(signals) = signals {
        let signal = {
            let guard = signals.read().unwrap();
            pick(&*guard)
        };
        emit_signal(&signal, &());
    }
}

pub fn for_each_node_child(source: &NodeRef, callback: &mut dyn FnMut(&NodeRef, usize) -> bool) {
    let children = get_node_runtime(&*source.read().unwrap()).children.clone();
    if let Some(children) = children {
        for (index, child) in children.iter().enumerate() {
            if !callback(child, index) {
                return;
            }
        }
    }
}

/// All ancestors of `source`, nearest first; the source is not included (TS `getNodeAncestors`).

pub fn get_node_ancestors(source: &NodeRef) -> Vec<NodeRef> {
    let mut result: Vec<NodeRef> = Vec::new();
    let mut current = get_node_parent(source);
    while let Some(node) = current {
        current = get_node_parent(&node);
        result.push(node);
    }
    return result;
}

/// The child at `index`, or null (TS `getNodeChildAt`).

pub fn get_node_child_at(source: &NodeRef, index: i32) -> Option<NodeRef> {
    let children = get_node_runtime(&*source.read().unwrap()).children.clone();
    if let Some(children) = children
        && index >= 0
        && (index as usize) < children.len()
    {
        return Some(children[index as usize].clone());
    }
    return None;
}

/// The first direct child with `name`, or null (TS `getNodeChildByName`).

pub fn get_node_child_by_name(source: &NodeRef, name: &str) -> Option<NodeRef> {
    let children = get_node_runtime(&*source.read().unwrap()).children.clone();
    if let Some(children) = children {
        for child in children {
            let matches = {
                let guard = child.read().unwrap();
                guard.node_fields().name.as_deref() == Some(name)
            };
            if matches {
                return Some(child);
            }
        }
    }
    return None;
}

/// The number of direct children (TS `getNodeChildCount`).

pub fn get_node_child_count(source: &NodeRef) -> usize {
    return get_node_runtime(&*source.read().unwrap())
        .children
        .as_ref()
        .map(|children| children.len())
        .unwrap_or(0);
}

/// The index of `child` in `source`'s children, or -1 (TS `getNodeChildIndex`).

pub fn get_node_child_index(source: &NodeRef, child: &NodeRef) -> i32 {
    let children = get_node_runtime(&*source.read().unwrap()).children.clone();
    if let Some(children) = children {
        for (index, entry) in children.iter().enumerate() {
            if node_arc_eq(entry, child) {
                return index as i32;
            }
        }
    }
    return -1;
}

/// The lowest common ancestor of `a` and `b`, or null (TS `getNodeCommonAncestor`).

pub fn get_node_common_ancestor(a: &NodeRef, b: &NodeRef) -> Option<NodeRef> {
    let mut ancestors: Vec<NodeRef> = Vec::new();
    ancestors.push(a.clone());
    let mut current = get_node_parent(a);
    while let Some(node) = current {
        current = get_node_parent(&node);
        ancestors.push(node);
    }
    let mut current = Some(b.clone());
    while let Some(node) = current {
        if ancestors
            .iter()
            .any(|ancestor| node_arc_eq(ancestor, &node))
        {
            return Some(node);
        }
        current = get_node_parent(&node);
    }
    return None;
}

/// The node's parent, or null (TS `getNodeParent`).

pub fn get_node_parent(source: &NodeRef) -> Option<NodeRef> {
    return get_node_runtime(&*source.read().unwrap())
        .parent
        .clone()
        .and_then(|parent| parent.upgrade());
}

/// The topmost ancestor, or the node itself (TS `getNodeRoot`).

pub fn get_node_root(source: &NodeRef) -> NodeRef {
    let mut current = source.clone();
    while let Some(parent) = get_node_parent(&current) {
        current = parent;
    }
    return current;
}

/// True when `ancestor` is `descendant` or above it in the hierarchy (TS `isNodeAncestorOf`).

pub fn is_node_ancestor_of(ancestor: &NodeRef, descendant: &NodeRef) -> bool {
    let mut current = Some(descendant.clone());
    while let Some(node) = current {
        if node_arc_eq(&node, ancestor) {
            return true;
        }
        current = get_node_parent(&node);
    }
    return false;
}

/// Removes `child` from `target`'s children and clears its parent (TS `removeNodeChild`).

fn node_arc_eq(a: &NodeRef, b: &NodeRef) -> bool {
    return Arc::ptr_eq(a, b);
}

pub fn remove_node_child(target: &NodeRef, child: &NodeRef) -> NodeRef {
    let is_child = get_node_parent(child)
        .as_ref()
        .map(|parent| node_arc_eq(parent, target))
        .unwrap_or(false);
    let has_children = target.read().unwrap().node_runtime().children.is_some();
    if is_child && has_children {
        child.write().unwrap().node_runtime_mut().parent = None;
        emit_unit_signal(child, |signals| signals.on_parent_changed.clone());
        invalidate_node_parent_reference(child);
        let removed = {
            let mut guard = target.write().unwrap();
            let runtime = guard.node_runtime_mut();
            let mut removed = false;
            if let Some(children) = runtime.children.as_mut()
                && let Some(index) = children.iter().position(|entry| node_arc_eq(entry, child))
            {
                children.remove(index);
                runtime.children_id = runtime.children_id.wrapping_add(1);
                removed = true;
            }
            removed
        };
        if removed {
            invalidate_node_world_bounds(target);
        }
        emit_node_signal(target, |signals| signals.on_child_removed.clone(), child);
        emit_unit_signal(target, |signals| signals.on_children_changed.clone());
    }
    return child.clone();
}

/// Removes the child at `index`, or null (TS `removeNodeChildAt`).

pub fn remove_node_child_at(target: &NodeRef, index: i32) -> Option<NodeRef> {
    let children = get_node_runtime(&*target.read().unwrap()).children.clone();
    if let Some(children) = children
        && index >= 0
        && (index as usize) < children.len()
    {
        return Some(remove_node_child(target, &children[index as usize]));
    }
    return None;
}

/// Removes the children in `begin_index..=end_index` (TS `removeNodeChildren`).

pub fn remove_node_children(target: &NodeRef, begin_index: Option<i32>, end_index: Option<i32>) {
    let child_count = get_node_child_count(target) as i32;
    let begin = begin_index.unwrap_or(0);
    if begin > child_count - 1 {
        return;
    }
    let end = end_index.unwrap_or(child_count - 1);
    if end < begin || begin < 0 || end > child_count {
        throw_out_of_bounds_error();
    }
    let mut removals = end - begin;
    while removals >= 0 {
        remove_node_child_at(target, begin);
        removals -= 1;
    }
}

/// Moves `child` under `new_parent` while preserving its world transform (TS `reparentNode`).
/// Returns false, having changed nothing, when the new parent has no invertible world matrix.

pub fn reparent_node(
    child: &NodeRef,
    new_parent: &NodeRef,
    revisions: &mut NodeRevisionState,
    guards: Option<&NodeGuardState>,
) -> bool {
    ensure_node_world_matrix(child, revisions);
    ensure_node_world_matrix(new_parent, revisions);
    let old_world = get_node_world_matrix(child, revisions);
    let mut local: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    let parent_world = get_node_world_matrix(new_parent, revisions);
    if !inverse_matrix(&mut local, &parent_world) {
        if let Some(guards) = guards
            && let Some(guard) = &guards.reparent_node_guard
        {
            let child_guard = child.read().unwrap();
            let parent_guard = new_parent.read().unwrap();
            guard(&*child_guard, &*parent_guard);
        }
        return false;
    }
    add_node_child(new_parent, child);
    let mut composed = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
    copy_matrix(&mut composed, &local);
    multiply_matrix(&mut local, &composed, &old_world);

    {
        let mut guard = child.write().unwrap();
        let transform = guard
            .as_transform2d_node_mut()
            .expect("reparentNode: child is not a Transform2D node");
        let (pivot_x, pivot_y) = {
            let fields = transform.transform2d();
            (fields.pivot_x, fields.pivot_y)
        };
        let mut decomposed: Transform2D =
            flight_geometry::create_transform2d(0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        decompose_matrix_to_transform2d(&mut decomposed, &local);
        let fields = transform.transform2d_mut();
        fields.pivot_x = pivot_x;
        fields.pivot_y = pivot_y;
        fields.rotation = decomposed.rotation;
        fields.scale_x = decomposed.scale_x;
        fields.scale_y = decomposed.scale_y;
        fields.skew_x = decomposed.skew_x;
        fields.skew_y = decomposed.skew_y;
        fields.x = local.tx + (local.a * pivot_x + local.c * pivot_y);
        fields.y = local.ty + (local.b * pivot_x + local.d * pivot_y);
    };
    invalidate_node_local_transform(child);
    return true;
}

/// Replaces `old_child` with `new_child` at the same index (TS `replaceNodeChild`).

pub fn replace_node_child(target: &NodeRef, old_child: &NodeRef, new_child: &NodeRef) {
    let index = get_node_child_index(target, old_child);
    if index == -1 {
        return;
    }
    remove_node_child(target, old_child);
    add_node_child_at(target, new_child, index);
}

/// Moves an existing child to `index` (TS `setNodeChildIndex`).

pub fn set_node_child_index(target: &NodeRef, child: &NodeRef, index: i32) {
    let is_child = get_node_parent(child)
        .as_ref()
        .map(|parent| node_arc_eq(parent, target))
        .unwrap_or(false);
    if !is_child {
        return;
    }
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    let Some(children) = runtime.children.as_mut() else {
        return;
    };
    if children.is_empty() || index < 0 || (index as usize) > children.len() {
        return;
    }
    let Some(current) = children.iter().position(|entry| node_arc_eq(entry, child)) else {
        return;
    };
    let destination = (index as usize).min(children.len() - 1);
    if current != destination {
        let entry = children.remove(current);
        children.insert(destination, entry);
        runtime.children_id = runtime.children_id.wrapping_add(1);
        drop(guard);
        emit_unit_signal(target, |signals| signals.on_children_order_changed.clone());
    }
}

/// Installs the guard called when a reparent declines (TS `setReparentNodeGuard`); the state is
/// caller-owned (D5).

pub fn set_reparent_node_guard(guards: &mut NodeGuardState, guard: Option<NodeReparentGuard>) {
    guards.reparent_node_guard = guard;
}

/// Swaps the z-order of two children (TS `swapNodeChildren`).

pub fn swap_node_children(target: &NodeRef, child1: &NodeRef, child2: &NodeRef) {
    let first_is_child = get_node_parent(child1)
        .as_ref()
        .map(|parent| node_arc_eq(parent, target))
        .unwrap_or(false);
    let second_is_child = get_node_parent(child2)
        .as_ref()
        .map(|parent| node_arc_eq(parent, target))
        .unwrap_or(false);
    if !first_is_child || !second_is_child {
        return;
    }
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    let Some(children) = runtime.children.as_mut() else {
        return;
    };
    let Some(index1) = children.iter().position(|entry| node_arc_eq(entry, child1)) else {
        return;
    };
    let Some(index2) = children.iter().position(|entry| node_arc_eq(entry, child2)) else {
        return;
    };
    if index1 == index2 {
        return;
    }
    children.swap(index1, index2);
    runtime.children_id = runtime.children_id.wrapping_add(1);
    drop(guard);
    emit_unit_signal(target, |signals| signals.on_children_order_changed.clone());
}

/// Swaps the z-order of the children at two indices (TS `swapNodeChildrenAt`).

pub fn swap_node_children_at(target: &NodeRef, index1: i32, index2: i32) {
    if index1 == index2 {
        return;
    }
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    let Some(children) = runtime.children.as_mut() else {
        return;
    };
    let len = children.len() as i32;
    if index1 < 0 || index2 < 0 || index1 >= len || index2 >= len {
        throw_out_of_bounds_error();
    }
    children.swap(index1 as usize, index2 as usize);
    runtime.children_id = runtime.children_id.wrapping_add(1);
    drop(guard);
    emit_unit_signal(target, |signals| signals.on_children_order_changed.clone());
}

fn throw_out_of_bounds_error() {
    panic!("The supplied index is out of bounds.");
}
