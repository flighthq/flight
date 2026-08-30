import type {
  AccessibilityLiveness,
  AccessibilityNode,
  AccessibilityOperationOutcome,
  HasAccessibilityProvider,
} from '@flighthq/types/contract';

// Speaks a transient message through the explicitly selected Host provider.
export function announceAccessibility(
  host: HasAccessibilityProvider,
  message: string,
  liveness: AccessibilityLiveness = 'polite',
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  return host.accessibility.provider.announce(message, liveness);
}

// Empties the selected Host provider's mirrored tree while leaving the provider reusable.
export function clearAccessibilityTree(
  host: HasAccessibilityProvider,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  return host.accessibility.provider.clear();
}

// Terminates the selected Host provider and frees the non-GC resources it owns. Provider destruction
// is idempotent; callers that share one provider across Hosts retain responsibility for its final release.
export function destroyAccessibility(host: HasAccessibilityProvider): void {
  host.accessibility.provider.destroy();
}

// Removes a node and its entire descendant subtree from the selected Host provider.
export function removeAccessibilityNode(
  host: HasAccessibilityProvider,
  id: string,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'> {
  return host.accessibility.provider.removeNode(id);
}

// Moves platform focus to a node published by the selected Host provider.
export function setAccessibilityFocus(
  host: HasAccessibilityProvider,
  id: string,
): AccessibilityOperationOutcome<'destroyed' | 'focus-not-moved' | 'no-dom' | 'node-not-found'> {
  return host.accessibility.provider.setFocus(id);
}

// Registers or updates a node in the selected Host provider's mirrored tree.
export function setAccessibilityNode(
  host: HasAccessibilityProvider,
  node: Readonly<AccessibilityNode>,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  return host.accessibility.provider.setNode(node);
}
