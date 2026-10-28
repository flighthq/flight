//! Node revision counters and invalidation (TS `revision.ts`).
//!
//! Each revision is a wrapping 32-bit counter. `-1` marks a derived value that has never been
//! computed for that axis.

// flight-lint: allow-file(contract-vocabulary, conform-params) D16 open node trait objects are contract dispatch; Rust passes the parent revision by value and the root runtime explicitly because a held parent guard cannot also lend the root mutably when they are the same node

use crate::types::{NodeRef, NodeRuntime};

/// Records that the node's world transform was just recomputed (TS
/// `computeNodeWorldTransformRevision`). A fresh monotonic id per recompute is what propagates
/// through every descendant, however deep.
///
/// The id is minted from the graph root's `world_transform_revision_counter`: `root` is the root's
/// runtime, or `None` when `target` is itself the root (has no parent). `parent_world_transform_id`
/// is the parent's current `world_transform_id`, or `None` for a root.
pub fn compute_node_world_transform_revision(
    target: &mut dyn crate::types::Node,
    parent_world_transform_id: Option<u32>,
    root: Option<&mut NodeRuntime>,
) {
    let local_transform_id = target.node_runtime().local_transform_id;
    let revision = match root {
        Some(root) => next_world_transform_revision(root),
        None => next_world_transform_revision(target.node_runtime_mut()),
    };
    let runtime = target.node_runtime_mut();
    runtime.world_transform_using_local_transform_id = local_transform_id as i32;
    runtime.world_transform_using_parent_transform_id =
        parent_world_transform_id.map(|id| id as i32).unwrap_or(0);
    runtime.world_transform_id = revision;
}

/// The node's appearance revision (TS `getNodeAppearanceRevision`).
pub fn get_node_appearance_revision(source: &dyn crate::types::Node) -> u32 {
    return source.node_runtime().appearance_id;
}

/// The node's child-membership/order revision (TS `getNodeChildrenRevision`).
pub fn get_node_children_revision(source: &dyn crate::types::Node) -> u32 {
    return source.node_runtime().children_id;
}

/// The node's local-bounds revision (TS `getNodeLocalBoundsRevision`).
pub fn get_node_local_bounds_revision(source: &dyn crate::types::Node) -> u32 {
    return source.node_runtime().local_bounds_id;
}

/// The node's local-content revision (TS `getNodeLocalContentRevision`).
pub fn get_node_local_content_revision(source: &dyn crate::types::Node) -> u32 {
    return source.node_runtime().local_content_id;
}

/// The node's local-transform revision (TS `getNodeLocalTransformRevision`).
pub fn get_node_local_transform_revision(source: &dyn crate::types::Node) -> u32 {
    return source.node_runtime().local_transform_id;
}

/// The node's parent-reference revision (TS `getNodeParentReferenceRevision`).
pub fn get_node_parent_reference_revision(source: &dyn crate::types::Node) -> u32 {
    return source.node_runtime().parent_reference_id;
}

/// The node's world-transform revision (TS `getNodeWorldTransformRevision`).
pub fn get_node_world_transform_revision(source: &dyn crate::types::Node) -> u32 {
    return source.node_runtime().world_transform_id;
}

/// The node's drawn payload and extent changed (TS `invalidateContent`). Never touches transform.
pub fn invalidate_content(target: &NodeRef) {
    invalidate_node_local_content(target);
    invalidate_node_local_bounds(target);
}

/// Every derived axis of the node is stale (TS `invalidateNode`).
pub fn invalidate_node(target: &NodeRef) {
    invalidate_node_appearance(target);
    invalidate_node_local_bounds(target);
    invalidate_node_local_content(target);
    invalidate_node_local_transform(target);
    invalidate_node_parent_reference(target);
    invalidate_node_world_bounds(target);
}

/// The node's appearance/compositing changed (TS `invalidateNodeAppearance`).
pub fn invalidate_node_appearance(target: &NodeRef) {
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    runtime.appearance_id = runtime.appearance_id.wrapping_add(1);
}

/// The node's own extent changed (TS `invalidateNodeLocalBounds`).
pub fn invalidate_node_local_bounds(target: &NodeRef) {
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    runtime.local_bounds_id = runtime.local_bounds_id.wrapping_add(1);
}

/// The node's rasterizable payload changed (TS `invalidateNodeLocalContent`).
pub fn invalidate_node_local_content(target: &NodeRef) {
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    runtime.local_content_id = runtime.local_content_id.wrapping_add(1);
}

/// The node's own local transform changed (TS `invalidateNodeLocalTransform`).
pub fn invalidate_node_local_transform(target: &NodeRef) {
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    runtime.local_transform_id = runtime.local_transform_id.wrapping_add(1);
}

/// The node's parent changed (TS `invalidateNodeParentReference`).
pub fn invalidate_node_parent_reference(target: &NodeRef) {
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    runtime.parent_reference_id = runtime.parent_reference_id.wrapping_add(1);
    runtime.world_transform_using_parent_transform_id = -1;
}

/// The node's visual output changed: appearance and transform (TS `invalidateNodeRender`).
pub fn invalidate_node_render(target: &NodeRef) {
    invalidate_node_appearance(target);
    invalidate_node_local_transform(target);
}

/// The node's child bounds changed (TS `invalidateNodeWorldBounds`): walks the ancestor chain.
pub fn invalidate_node_world_bounds(target: &NodeRef) {
    let mut current = Some(target.clone());
    while let Some(node) = current {
        let next = {
            let mut guard = node.write().unwrap();
            let runtime = guard.node_runtime_mut();
            runtime.world_bounds_using_world_transform_id = -1;
            runtime.world_bounds_using_local_bounds_id = -1;
            guard.node_runtime().parent.clone()
        };
        current = next.and_then(|parent| parent.upgrade());
    }
}

// 0 is the fresh-runtime sentinel (never a live revision), so step past a wrap back to 0.
fn next_world_transform_revision(root: &mut NodeRuntime) -> u32 {
    let mut revision = root.world_transform_revision_counter.wrapping_add(1);
    if revision == 0 {
        revision = 1;
    }
    root.world_transform_revision_counter = revision;
    return revision;
}
