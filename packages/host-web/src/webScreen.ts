import { createWebScreenBackend, installScreenHostBackend } from '@flighthq/screen/contract';

export function enableHostWebScreen(): void {
  if (_enabled) return;
  _enabled = true;
  installScreenHostBackend(createWebScreenBackend());
}

export function resetHostWebScreenForTest(): void {
  _enabled = false;
}

let _enabled = false;
