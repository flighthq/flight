import type {
  BackendExplanation,
  BackendOperationExplanation,
  BitmapEncodeBackend,
  BitmapEncodeOperation,
} from '@flighthq/types/contract';

export function explainBitmapEncodeBackend(): BackendExplanation {
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

export function explainBitmapEncodeOperation(operation: BitmapEncodeOperation): BackendOperationExplanation {
  if (_custom !== null) return { implemented: true, layer: 'custom', operation };
  if (_host !== null) return { implemented: true, layer: 'host', operation };
  return { implemented: false, layer: 'sentinel', operation };
}

export function getBitmapEncodeBackend(): BitmapEncodeBackend | null {
  return _custom ?? _host;
}

export function hasBitmapEncodeHostBackend(): boolean {
  return _host !== null;
}

export function hasBitmapEncodeOperation(operation: BitmapEncodeOperation): boolean {
  return explainBitmapEncodeOperation(operation).implemented;
}

export function installBitmapEncodeHostBackend(backend: BitmapEncodeBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeBitmapEncodeHostResult(operation: BitmapEncodeOperation, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetBitmapEncodeBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setBitmapEncodeBackend(backend: BitmapEncodeBackend | null): void {
  _custom = backend;
}

let _custom: BitmapEncodeBackend | null = null;
let _host: BitmapEncodeBackend | null = null;
let _hostConflict = false;
let _hostObservation: {
  operation: BitmapEncodeOperation;
  viability: 'available' | 'runtime-api-unavailable';
} | null = null;
