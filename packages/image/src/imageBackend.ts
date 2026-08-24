import type { BackendExplanation, Image, ImageBackend } from '@flighthq/types/contract';

import { createImageResourceFromImageElement } from './imageResourceFrom';

export function createWebImageBackend(): ImageBackend {
  return {
    async loadImageFromUrl(url, crossOrigin, signal): Promise<Image> {
      signal?.throwIfAborted();
      const img = new Image();
      if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
      img.src = url;
      if (signal !== undefined) {
        let rejectAbort: (reason?: unknown) => void = () => {};
        const abortPromise = new Promise<never>((_, reject) => {
          rejectAbort = reject;
        });
        const onAbort = (): void => {
          img.src = '';
          rejectAbort(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          await Promise.race([img.decode(), abortPromise]);
        } finally {
          signal.removeEventListener('abort', onAbort);
        }
      } else {
        await img.decode();
      }
      return createImageResourceFromImageElement(img);
    },
  };
}

export function explainImageBackend(): BackendExplanation {
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

export function getImageBackend(): ImageBackend {
  return _custom ?? _host ?? _sentinel;
}

export function installImageHostBackend(backend: ImageBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeImageHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetImageBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setImageBackend(backend: ImageBackend | null): void {
  _custom = backend;
}

const _sentinel: ImageBackend = {
  loadImageFromUrl(
    _url: string,
    _crossOrigin?: 'anonymous' | 'use-credentials',
    _signal?: AbortSignal,
  ): Promise<Image> {
    return Promise.reject(
      new Error('No image backend installed. Call enableHostWebImage() or setImageBackend() first.'),
    );
  },
};

let _custom: ImageBackend | null = null;
let _host: ImageBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
