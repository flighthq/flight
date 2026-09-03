import type {
  BackendExplanation,
  BackendOperationExplanation,
  ImageResource,
  ImageBackend,
  ImageBackendOperation,
} from '@flighthq/types/contract';

import { createEntity } from '@flighthq/entity/contract';

import { createImageResourceFromCanvas, createImageResourceFromImageElement } from './imageResourceFrom';

export function createWebImageBackend(): ImageBackend {
  return createEntity({
    createImageFromBitmap(bitmap): ImageResource {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const domImageData = new globalThis.ImageData(bitmap.width, bitmap.height);
      domImageData.data.set(bitmap.alphaType === 'premultiplied' ? unpremultiplyRgba8(bitmap.data) : bitmap.data);
      canvas.getContext('2d')!.putImageData(domImageData, 0, 0);
      return createImageResourceFromCanvas(canvas);
    },
    async loadImageFromUrl(url, crossOrigin, signal): Promise<ImageResource> {
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
  });
}

// ImageData is straight-alpha by contract. Preserve a Bitmap's declared representation at its own
// seam, then normalize only the scratch browser copy used to materialize a CanvasImageSource.
function unpremultiplyRgba8(source: Readonly<Uint8ClampedArray>): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(source);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      continue;
    }
    const scale = 255 / alpha;
    data[i] = Math.min(255, Math.round(data[i] * scale));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * scale));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * scale));
  }
  return data;
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

// Reports support for exactly one ImageResource operation on the selected backend. A custom backend masks the
// host as a whole, so an omitted optional method does not fall through to a host implementation.
export function explainImageOperation(operation: ImageBackendOperation): BackendOperationExplanation {
  if (_custom !== null) {
    return typeof _custom[operation] === 'function'
      ? { implemented: true, layer: 'custom', operation }
      : { implemented: false, layer: 'none', operation };
  }
  if (_host !== null) {
    return typeof _host[operation] === 'function'
      ? { implemented: true, layer: 'host', operation }
      : { implemented: false, layer: 'none', operation };
  }
  return {
    implemented: false,
    layer: typeof _sentinel[operation] === 'function' ? 'sentinel' : 'none',
    operation,
  };
}

export function getImageBackend(): ImageBackend {
  return _custom ?? _host ?? _sentinel;
}

export function hasImageOperation(operation: ImageBackendOperation): boolean {
  return explainImageOperation(operation).implemented;
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
  ): Promise<ImageResource> {
    return Promise.reject(
      new Error('No image backend installed. Call enableHostWebImage() or setImageBackend() first.'),
    );
  },
};

let _custom: ImageBackend | null = null;
let _host: ImageBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
