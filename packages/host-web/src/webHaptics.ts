import { createWebHapticsBackend, installHapticsHostBackend } from '@flighthq/haptics/contract';

export function enableHostWebHaptics(): void {
  if (_enabled) return;
  _enabled = true;
  installHapticsHostBackend(createWebHapticsBackend());
}

export function resetHostWebHapticsForTest(): void {
  _enabled = false;
}

let _enabled = false;
