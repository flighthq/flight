import type {
  BitmapReadbackBackend,
  BitmapReadbackBackendReason,
  HasGraphicsBitmapReadback,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { createBitmap } from './bitmap';
import { createBitmapFromImageSource } from './bitmapFrom';
import { explainBitmapReadback } from './explainBitmapReadback';

function hostWith(backend: BitmapReadbackBackend): HasGraphicsBitmapReadback {
  return { graphics: { bitmapReadback: backend } } as HasGraphicsBitmapReadback;
}

function makeCanvas(width = 8, height = 4): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe('explainBitmapReadback', () => {
  it('reports empty-size before touching the backend', () => {
    const readBitmap = vi.fn(() => ({ bitmap: null, reason: 'tainted-source' as const }));
    const host = hostWith({ readBitmap });

    expect(explainBitmapReadback(host, makeCanvas(), 0, 4)).toEqual({ readable: false, reason: 'empty-size' });
    expect(explainBitmapReadback(host, makeCanvas(), 8, 0)).toEqual({ readable: false, reason: 'empty-size' });
    expect(explainBitmapReadback(host, makeCanvas(), -1, 4)).toEqual({ readable: false, reason: 'empty-size' });
    expect(createBitmapFromImageSource(host, makeCanvas(), 8, -1)).toBeNull();
    expect(readBitmap).not.toHaveBeenCalled();
  });

  it('returns the exact success outcome and keeps constructor/explainer parity', () => {
    const bitmap = createBitmap(8, 4);
    const readBitmap: BitmapReadbackBackend['readBitmap'] = vi.fn((_source, _width, _height, mode) => ({
      bitmap: mode === 'bitmap' ? bitmap : null,
      reason: 'ok' as const,
    }));
    const host = hostWith({ readBitmap });
    const source = makeCanvas();

    expect(createBitmapFromImageSource(host, source, 8, 4)).toBe(bitmap);
    expect(explainBitmapReadback(host, source, 8, 4)).toEqual({ readable: true, reason: 'ok' });
    expect(readBitmap).toHaveBeenNthCalledWith(1, source, 8, 4, 'bitmap');
    expect(readBitmap).toHaveBeenNthCalledWith(2, source, 8, 4, 'probe');
  });

  it.each(['no-canvas', 'tainted-source'] satisfies readonly BitmapReadbackBackendReason[])(
    'preserves the exact expected-failure reason %s',
    (reason) => {
      const host = hostWith({ readBitmap: () => ({ bitmap: null, reason }) });
      const source = makeCanvas();

      expect(createBitmapFromImageSource(host, source, 8, 4)).toBeNull();
      expect(explainBitmapReadback(host, source, 8, 4)).toEqual({ readable: false, reason });
    },
  );

  it('does not predict a full-read allocation fault from a successful probe', () => {
    const fault = new RangeError('full bitmap allocation failed');
    const host = hostWith({
      readBitmap(_source, _width, _height, mode) {
        if (mode === 'bitmap') throw fault;
        return { bitmap: null, reason: 'ok' };
      },
    });
    const source = makeCanvas();

    expect(explainBitmapReadback(host, source, 8, 4)).toEqual({ readable: true, reason: 'ok' });
    expect(() => createBitmapFromImageSource(host, source, 8, 4)).toThrow(fault);
  });
});
