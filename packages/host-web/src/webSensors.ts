import { createWebSensorsBackend, installSensorsHostBackend } from '@flighthq/sensors/contract';

export function enableHostWebSensors(): void {
  if (_enabled) return;
  _enabled = true;
  installSensorsHostBackend(createWebSensorsBackend());
}

export function resetHostWebSensorsForTest(): void {
  _enabled = false;
}

let _enabled = false;
