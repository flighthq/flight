import { createWebLifecycleBackend, installLifecycleHostBackend } from '@flighthq/lifecycle/contract';

export function enableHostWebLifecycle(): void {
  if (_enabled) return;
  _enabled = true;
  installLifecycleHostBackend(createWebLifecycleBackend());
}

export function resetHostWebLifecycleForTest(): void {
  _enabled = false;
}

let _enabled = false;
