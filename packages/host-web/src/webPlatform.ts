import { createWebPlatformBackend, installPlatformHostBackend } from '@flighthq/platform/contract';

export function enableHostWebPlatform(): void {
  if (_enabled) return;
  _enabled = true;
  installPlatformHostBackend(createWebPlatformBackend());
}

export function resetHostWebPlatformForTest(): void {
  _enabled = false;
}

let _enabled = false;
