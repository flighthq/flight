//! The accessibility command facade: six public functions that forward to the explicitly selected
//! host provider (TS `accessibility.ts`). No native semantic tree, DOM, screen reader or focus
//! operation lives here.

use crate::types::*;

/// Speaks a transient message through the selected host provider (TS `announceAccessibility`). The
/// liveness defaults to `polite` in the source's optional position; the provider outcome is
/// forwarded unchanged.
pub fn announce_accessibility(
    host_accessibility: &HostAccessibilityCapability,
    message: &str,
    liveness: Option<AccessibilityLiveness>,
) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
    let announce = host_accessibility.announce.clone();
    let resolved = liveness.unwrap_or(AccessibilityLiveness::Polite);
    return announce(message, resolved);
}

/// Empties the selected provider's mirrored tree while leaving the provider reusable (TS
/// `clearAccessibilityTree`).
pub fn clear_accessibility_tree(
    host_accessibility: &HostAccessibilityCapability,
) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
    let clear = host_accessibility.clear.clone();
    return clear();
}

/// Terminates the selected provider and frees the non-GC resources it owns (TS
/// `destroyAccessibility`). Provider destruction is idempotent; a caller that shares one provider
/// retains responsibility for its final release.
pub fn destroy_accessibility(host_accessibility: &HostAccessibilityCapability) {
    let destroy = host_accessibility.destroy.clone();
    return destroy();
}

/// Removes a node and its entire descendant subtree from the selected provider (TS
/// `removeAccessibilityNode`).
pub fn remove_accessibility_node(
    host_accessibility: &HostAccessibilityCapability,
    id: &str,
) -> AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason> {
    let remove_node = host_accessibility.remove_node.clone();
    return remove_node(id);
}

/// Moves platform focus to a node published by the selected provider (TS
/// `setAccessibilityFocus`).
pub fn set_accessibility_focus(
    host_accessibility: &HostAccessibilityCapability,
    id: &str,
) -> AccessibilityOperationOutcome<AccessibilityOperationBlockReason> {
    let set_focus = host_accessibility.set_focus.clone();
    return set_focus(id);
}

/// Registers or updates a node in the selected provider's mirrored tree (TS
/// `setAccessibilityNode`). The node is forwarded by reference, so its identity, shared `bounds`
/// handle and optional-field absence are preserved at the provider boundary.
pub fn set_accessibility_node(
    host_accessibility: &HostAccessibilityCapability,
    node: &AccessibilityNode,
) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
    let set_node = host_accessibility.set_node.clone();
    return set_node(node);
}
