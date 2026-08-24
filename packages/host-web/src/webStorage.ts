import { createWebStorageBackend, installStorageHostBackend } from '@flighthq/storage/contract';

export function enableHostWebStorage(): void {
  if (_enabled) return;
  _enabled = true;
  installStorageHostBackend(createWebStorageBackend());
}

export function resetHostWebStorageForTest(): void {
  _enabled = false;
}

let _enabled = false;
