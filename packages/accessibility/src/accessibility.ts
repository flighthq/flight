import type {
  AccessibilityLiveness,
  AccessibilityNode,
  AccessibilityOperationOutcome,
  HostAccessibilityCapability,
} from '@flighthq/types/contract';

// Speaks a transient message through the explicitly selected Host provider.
export function announceAccessibility(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  message: string,
  liveness: AccessibilityLiveness = 'polite',
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  return hostAccessibility.announce(message, liveness);
}

// Empties the selected Host provider's mirrored tree while leaving the provider reusable.
export function clearAccessibilityTree(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  return hostAccessibility.clear();
}

// Terminates the selected Host provider and frees the non-GC resources it owns. Provider destruction
// is idempotent; callers that share one provider across Hosts retain responsibility for its final release.
export function destroyAccessibility(hostAccessibility: Readonly<HostAccessibilityCapability>): void {
  hostAccessibility.destroy();
}

// Removes a node and its entire descendant subtree from the selected Host provider.
export function removeAccessibilityNode(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  id: string,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'> {
  return hostAccessibility.removeNode(id);
}

// Moves platform focus to a node published by the selected Host provider.
export function setAccessibilityFocus(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  id: string,
): AccessibilityOperationOutcome<'destroyed' | 'focus-not-moved' | 'no-dom' | 'node-not-found'> {
  return hostAccessibility.setFocus(id);
}

// Registers or updates a node in the selected Host provider's mirrored tree.
export function setAccessibilityNode(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  node: Readonly<AccessibilityNode>,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  return hostAccessibility.setNode(node);
}
