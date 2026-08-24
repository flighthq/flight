import { createWebAccessibilityBackend, installAccessibilityHostBackend } from '@flighthq/accessibility/contract';

export function enableHostWebAccessibility(): void {
  if (_enabled) return;
  _enabled = true;
  installAccessibilityHostBackend(createWebAccessibilityBackend());
}

export function resetHostWebAccessibilityForTest(): void {
  _enabled = false;
}

let _enabled = false;
