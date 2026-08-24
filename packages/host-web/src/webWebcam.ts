import { createWebWebcamBackend, installWebcamHostBackend } from '@flighthq/webcam/contract';

export function enableHostWebWebcam(): void {
  if (_enabled) return;
  _enabled = true;
  installWebcamHostBackend(createWebWebcamBackend());
}

export function resetHostWebWebcamForTest(): void {
  _enabled = false;
}

let _enabled = false;
