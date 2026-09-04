import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bitmap, BitmapReadbackBackend, Entity, EntityConstruction } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

export function createWebBitmapReadbackBackend(): BitmapReadbackBackend & Entity {
  const out = allocateEntity<BitmapReadbackBackend & Entity>();
  initializeWebBitmapReadbackBackend(out);
  return finishEntity(out);
}

export function initializeWebBitmapReadbackBackend(out: EntityConstruction<BitmapReadbackBackend & Entity>): void {
  out.readBitmap = (source, width, height, mode) => {
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

    const bitmap = (() => {
      const out = allocateEntity<Bitmap>();
      out.alphaType = 'straight';
      out.gamut = raw.colorSpace as 'display-p3' | 'srgb';
      out.data = raw.data;
      out.format = 'rgba8unorm';
      out.height = raw.height;
      out.kind = BitmapTextureSourceKind;
      out.version = 0;
      out.width = raw.width;
      return finishEntity(out);
    })();
    return { bitmap, reason: 'ok' };
  };
}

export const webBitmapReadbackBackend: BitmapReadbackBackend & Entity = createWebBitmapReadbackBackend();

function isExpectedSourceRefusal(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && (error.name === 'InvalidStateError' || error.name === 'SecurityError'))
  );
}

function isTaintedCanvasRefusal(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError';
}
