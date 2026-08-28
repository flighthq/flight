import type { AudioBackend, BackendExplanation } from '@flighthq/types/contract';

export function createWebAudioBackend(): AudioBackend {
  return {
    canPlayType(mimeType: string): boolean {
      return new Audio().canPlayType(mimeType) !== '';
    },
  };
}

export function explainAudioBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getAudioBackend(): AudioBackend {
  return _custom ?? _host ?? _sentinel;
}

export function installAudioHostBackend(backend: AudioBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeAudioHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetAudioBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setAudioBackend(backend: AudioBackend | null): void {
  _custom = backend;
}

let _custom: AudioBackend | null = null;
let _host: AudioBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: AudioBackend = {
  canPlayType(_mimeType: string): boolean {
    return false;
  },
};
