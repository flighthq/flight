import type { BitmapReadbackBackend } from '@flighthq/types/contract';

export function getBitmapReadbackBackend(): BitmapReadbackBackend | null {
  return _custom ?? _host;
}

export function hasBitmapReadbackHostBackend(): boolean {
  return _host !== null;
}

export function installBitmapReadbackHostBackend(backend: BitmapReadbackBackend): void {
  if (_host !== null) return;
  _host = backend;
}

export function resetBitmapReadbackBackendForTest(): void {
  _custom = null;
  _host = null;
}

export function setBitmapReadbackBackend(backend: BitmapReadbackBackend | null): void {
  _custom = backend;
}

let _custom: BitmapReadbackBackend | null = null;
let _host: BitmapReadbackBackend | null = null;
