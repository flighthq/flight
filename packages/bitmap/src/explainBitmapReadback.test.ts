import { describe, expect, it, vi } from 'vitest';

import { createBitmapFromImageSource } from './bitmapFrom';
import { explainBitmapReadback } from './explainBitmapReadback';

function makeCanvas(width = 8, height = 4): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe('explainBitmapReadback', () => {
  it('reports a readable source as ok', () => {
    expect(explainBitmapReadback(makeCanvas(), 8, 4)).toEqual({ readable: true, reason: 'ok' });
  });

  it('reports an empty capture without touching the source', () => {
    expect(explainBitmapReadback(makeCanvas(), 0, 4)).toEqual({ readable: false, reason: 'empty-size' });
    expect(explainBitmapReadback(makeCanvas(), 8, 0)).toEqual({ readable: false, reason: 'empty-size' });
    expect(explainBitmapReadback(makeCanvas(), -1, 4)).toEqual({ readable: false, reason: 'empty-size' });
  });

  it('reports a tainted source', () => {
    const spy = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    try {
      expect(explainBitmapReadback(makeCanvas(), 8, 4)).toEqual({ readable: false, reason: 'tainted-source' });
    } finally {
      spy.mockRestore();
    }
  });

  it('prefers the reason knowable without drawing — an empty capture outranks a tainted source', () => {
    const spy = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    try {
      expect(explainBitmapReadback(makeCanvas(), 0, 4).reason).toBe('empty-size');
    } finally {
      spy.mockRestore();
    }
  });

  it('agrees with what createBitmapFromImageSource actually does', () => {
    // The pull query duplicates the constructor's failure conditions by design, so the pairing is the
    // thing worth pinning: readable exactly when a bitmap comes back.
    const canvas = makeCanvas();
    expect(explainBitmapReadback(canvas, 8, 4).readable).toBe(createBitmapFromImageSource(canvas, 8, 4) !== null);
    expect(explainBitmapReadback(canvas, 0, 4).readable).toBe(createBitmapFromImageSource(canvas, 0, 4) !== null);

    const spy = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    try {
      expect(explainBitmapReadback(canvas, 8, 4).readable).toBe(createBitmapFromImageSource(canvas, 8, 4) !== null);
    } finally {
      spy.mockRestore();
    }
  });

  it('never throws, whatever the source does', () => {
    const spy = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage').mockImplementation(() => {
      throw new TypeError('unsupported source');
    });
    try {
      expect(() => explainBitmapReadback(makeCanvas(), 8, 4)).not.toThrow();
      expect(explainBitmapReadback(makeCanvas(), 8, 4).readable).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('allocates no bitmap — it reads one pixel, not the whole capture', () => {
    const spy = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
    try {
      explainBitmapReadback(makeCanvas(1024, 1024), 1024, 1024);
      expect(spy).toHaveBeenCalledWith(0, 0, 1, 1);
    } finally {
      spy.mockRestore();
    }
  });
});
