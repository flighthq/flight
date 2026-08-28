import type { BackendExplanation, FontLoadingBackend } from '@flighthq/types/contract';

export function explainFontLoadingBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return { conflict: _hostConflict, layer: 'host', operation: null, viability: 'unobserved' };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getFontLoadingBackend(): FontLoadingBackend {
  return _custom ?? _host ?? _sentinel;
}

export function hasFontLoadingHostBackend(): boolean {
  return _host !== null;
}

export function installFontLoadingHostBackend(backend: FontLoadingBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function resetFontLoadingBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
}

export function setFontLoadingBackend(backend: FontLoadingBackend | null): void {
  _custom = backend;
}

let _custom: FontLoadingBackend | null = null;
let _host: FontLoadingBackend | null = null;
let _hostConflict = false;

const _sentinel: FontLoadingBackend = {
  addFontFace(): void {},
  checkFontFace(): boolean {
    return false;
  },
  loadFontFaces(): Promise<FontFace[]> {
    return Promise.resolve([]);
  },
  whenReady(): Promise<void> {
    return Promise.resolve();
  },
};
