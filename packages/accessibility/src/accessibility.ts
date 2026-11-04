// Generated from crates/flight-accessibility/src/accessibility.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type {
  AccessibilityLiveness,
  AccessibilityNode,
  AccessibilityOperationOutcome,
  HostAccessibilityCapability,
} from '@flighthq/types/contract';

/**
 * Speaks a transient message through the selected host provider (TS `announceAccessibility`). The
 * liveness defaults to `polite` in the source's optional position; the provider outcome is
 * forwarded unchanged.
 */
export function announceAccessibility(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  message: string,
  liveness?: AccessibilityLiveness,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  const announce = hostAccessibility.announce;
  const resolved = liveness ?? 'polite';
  return announce(message, resolved);
}

/**
 * Empties the selected provider's mirrored tree while leaving the provider reusable (TS
 * `clearAccessibilityTree`).
 */
export function clearAccessibilityTree(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  const clear = hostAccessibility.clear;
  return clear();
}

/**
 * Terminates the selected provider and frees the non-GC resources it owns (TS
 * `destroyAccessibility`). Provider destruction is idempotent; a caller that shares one provider
 * retains responsibility for its final release.
 */
export function destroyAccessibility(hostAccessibility: Readonly<HostAccessibilityCapability>): void {
  const destroy = hostAccessibility.destroy;
  return destroy();
}

/**
 * Removes a node and its entire descendant subtree from the selected provider (TS
 * `removeAccessibilityNode`).
 */
export function removeAccessibilityNode(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  id: string,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'> {
  const removeNode = hostAccessibility.removeNode;
  return removeNode(id);
}

/**
 * Moves platform focus to a node published by the selected provider (TS
 * `setAccessibilityFocus`).
 */
export function setAccessibilityFocus(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  id: string,
): AccessibilityOperationOutcome<'destroyed' | 'focus-not-moved' | 'no-dom' | 'node-not-found'> {
  const setFocus = hostAccessibility.setFocus;
  return setFocus(id);
}

/**
 * Registers or updates a node in the selected provider's mirrored tree (TS
 * `setAccessibilityNode`). The node is forwarded by reference, so its identity, shared `bounds`
 * handle and optional-field absence are preserved at the provider boundary.
 */
export function setAccessibilityNode(
  hostAccessibility: Readonly<HostAccessibilityCapability>,
  node: Readonly<AccessibilityNode>,
): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> {
  const setNode = hostAccessibility.setNode;
  return setNode(node);
}
