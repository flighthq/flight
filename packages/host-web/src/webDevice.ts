import { createWebDeviceBackend, installDeviceHostBackend } from '@flighthq/device/contract';

export function enableHostWebDevice(): void {
  if (_enabled) return;
  _enabled = true;
  installDeviceHostBackend(createWebDeviceBackend());
}

export function resetHostWebDeviceForTest(): void {
  _enabled = false;
}

let _enabled = false;
