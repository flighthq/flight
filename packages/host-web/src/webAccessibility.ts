import {
  createWebAccessibilityBackend,
  hasAccessibilityHostBackend,
  installAccessibilityHostBackend,
  resetAccessibilityBackendForTest,
} from '@flighthq/accessibility/contract';

// ★ THE GUARD ASKS RATHER THAN REMEMBERS. This was `if (_enabled) return; _enabled = true;` — a host-local
// copy of a fact `@flighthq/accessibility` owns. Nothing reset it, so once `destroyAccessibilityBackend`
// cleared the host slot the two disagreed permanently: the slot was empty, this function believed it had
// already installed, and the capability answered from its sentinel for the life of the process.
export function enableHostWebAccessibility(): void {
  if (hasAccessibilityHostBackend()) return;
  installAccessibilityHostBackend(createWebAccessibilityBackend());
}

// The host holds no enable state of its own any more, so "un-enable" means clearing the capability slot
// this installed into. Delegates rather than reaching past the owner: the slot belongs to
// `@flighthq/accessibility`, and this is its own published test seam.
export function resetHostWebAccessibilityForTest(): void {
  resetAccessibilityBackendForTest();
}
