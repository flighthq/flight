import type { BitmapReadbackBackend, BitmapReadbackBackendReason } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { createBitmap } from './bitmap';
import { createBitmapFromImageSource } from './bitmapFrom';
import {
  installBitmapReadbackHostBackend,
  resetBitmapReadbackBackendForTest,
  setBitmapReadbackBackend,
} from './bitmapReadbackBackend';
import { explainBitmapReadback } from './explainBitmapReadback';

function makeCanvas(width = 8, height = 4): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

afterEach(() => {
  resetBitmapReadbackBackendForTest();
});

describe('explainBitmapReadback', () => {
  it('reports empty-size before selecting or touching a backend', () => {
    const readBitmap = vi.fn(() => ({ bitmap: null, reason: 'tainted-source' as const }));
    setBitmapReadbackBackend({ readBitmap });

    expect(explainBitmapReadback(makeCanvas(), 0, 4)).toEqual({ readable: false, reason: 'empty-size' });
    expect(explainBitmapReadback(makeCanvas(), 8, 0)).toEqual({ readable: false, reason: 'empty-size' });
    expect(explainBitmapReadback(makeCanvas(), -1, 4)).toEqual({ readable: false, reason: 'empty-size' });
    expect(createBitmapFromImageSource(makeCanvas(), 8, -1)).toBeNull();
    expect(readBitmap).not.toHaveBeenCalled();
  });

  it('distinguishes an absent backend from a host with no canvas', () => {
    const source = makeCanvas();

    expect(explainBitmapReadback(source, 8, 4)).toEqual({
      readable: false,
      reason: 'backend-not-installed',
    });
    expect(createBitmapFromImageSource(source, 8, 4)).toBeNull();
  });

  it('treats custom selection as terminal when a hidden host would succeed', () => {
    const hostBitmap = createBitmap(8, 4);
    const hostRead = vi.fn<BitmapReadbackBackend['readBitmap']>((_source, _width, _height, mode) => ({
      bitmap: mode === 'bitmap' ? hostBitmap : null,
      reason: 'ok' as const,
    }));
    const customRead = vi.fn(() => ({ bitmap: null, reason: 'no-canvas' as const }));
    installBitmapReadbackHostBackend({ readBitmap: hostRead });
    setBitmapReadbackBackend({ readBitmap: customRead });
    const source = makeCanvas();

    expect(createBitmapFromImageSource(source, 8, 4)).toBeNull();
    expect(explainBitmapReadback(source, 8, 4)).toEqual({ readable: false, reason: 'no-canvas' });
    expect(customRead).toHaveBeenCalledTimes(2);
    expect(hostRead).not.toHaveBeenCalled();
  });

  it('returns the exact success outcome and keeps constructor/explainer parity', () => {
    const bitmap = createBitmap(8, 4);
    const readBitmap: BitmapReadbackBackend['readBitmap'] = vi.fn((_source, _width, _height, mode) => ({
      bitmap: mode === 'bitmap' ? bitmap : null,
      reason: 'ok' as const,
    }));
    setBitmapReadbackBackend({ readBitmap });
    const source = makeCanvas();

    expect(createBitmapFromImageSource(source, 8, 4)).toBe(bitmap);
    expect(explainBitmapReadback(source, 8, 4)).toEqual({ readable: true, reason: 'ok' });
    expect(readBitmap).toHaveBeenNthCalledWith(1, source, 8, 4, 'bitmap');
    expect(readBitmap).toHaveBeenNthCalledWith(2, source, 8, 4, 'probe');
  });

  it.each(['no-canvas', 'tainted-source'] satisfies readonly BitmapReadbackBackendReason[])(
    'preserves the exact expected-failure reason %s',
    (reason) => {
      const backend: BitmapReadbackBackend = { readBitmap: () => ({ bitmap: null, reason }) };
      setBitmapReadbackBackend(backend);
      const source = makeCanvas();

      expect(createBitmapFromImageSource(source, 8, 4)).toBeNull();
      expect(explainBitmapReadback(source, 8, 4)).toEqual({ readable: false, reason });
    },
  );

  it('does not predict a full-read allocation fault from a successful probe', () => {
    const fault = new RangeError('full bitmap allocation failed');
    const backend: BitmapReadbackBackend = {
      readBitmap(_source, _width, _height, mode) {
        if (mode === 'bitmap') throw fault;
        return { bitmap: null, reason: 'ok' };
      },
    };
    setBitmapReadbackBackend(backend);
    const source = makeCanvas();

    expect(explainBitmapReadback(source, 8, 4)).toEqual({ readable: true, reason: 'ok' });
    expect(() => createBitmapFromImageSource(source, 8, 4)).toThrow(fault);
  });
});
