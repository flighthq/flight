import { createWebMediaFileCaptureBackend, installMediaFileCaptureHostBackend } from '@flighthq/webcam/contract';

export function enableHostWebMediaFileCapture(): void {
  if (_enabled) return;
  _enabled = true;
  installMediaFileCaptureHostBackend(createWebMediaFileCaptureBackend());
}

export function resetHostWebMediaFileCaptureForTest(): void {
  _enabled = false;
}

let _enabled = false;
