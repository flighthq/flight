import { hasBitmapReadbackHostBackend, installBitmapReadbackHostBackend } from '@flighthq/bitmap/contract';
import { createEntity } from '@flighthq/entity/contract';
import type { Bitmap, BitmapReadbackBackend, Entity } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

export function createWebBitmapReadbackBackend(): BitmapReadbackBackend & Entity {
  return createEntity({
    readBitmap(source, width, height, mode) {
      if (typeof document === 'undefined') return { bitmap: null, reason: 'no-canvas' };
      const canvas = document.createElement('canvas');
      const probe = mode === 'probe';
      canvas.width = probe ? 1 : width;
      canvas.height = probe ? 1 : height;
      const context = canvas.getContext('2d');
      if (context === null) return { bitmap: null, reason: 'no-canvas' };

      try {
        context.drawImage(source, 0, 0);
      } catch (error) {
        if (isExpectedSourceRefusal(error)) return { bitmap: null, reason: 'tainted-source' };
        throw error;
      }

      let raw: ImageData;
      try {
        raw = context.getImageData(0, 0, probe ? 1 : width, probe ? 1 : height);
      } catch (error) {
        if (isTaintedCanvasRefusal(error)) return { bitmap: null, reason: 'tainted-source' };
        throw error;
      }
      if (probe) return { bitmap: null, reason: 'ok' };

      const bitmap: Bitmap = createEntity({
        alphaType: 'straight',
        gamut: raw.colorSpace as 'display-p3' | 'srgb',
        data: raw.data,
        format: 'rgba8unorm',
        height: raw.height,
        kind: BitmapTextureSourceKind,
        version: 0,
        width: raw.width,
      });
      return { bitmap, reason: 'ok' };
    },
  } satisfies BitmapReadbackBackend);
}

export function enableHostWebBitmapReadback(): void {
  if (hasBitmapReadbackHostBackend()) return;
  installBitmapReadbackHostBackend(createWebBitmapReadbackBackend());
}

function isExpectedSourceRefusal(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && (error.name === 'InvalidStateError' || error.name === 'SecurityError'))
  );
}

function isTaintedCanvasRefusal(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError';
}
