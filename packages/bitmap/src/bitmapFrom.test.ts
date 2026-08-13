import { createImageResource } from '@flighthq/image/contract';
import { vi } from 'vitest';

import { createBitmap } from './bitmap';
import { createBitmapFromCanvas, captureBitmapFromImageResource, createBitmapFromImageSource } from './bitmapFrom';

describe('captureBitmapFromImageResource', () => {
  it('reads a host-backed resource into CPU pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 2;
    const bitmap = captureBitmapFromImageResource(createImageResource(canvas));
    expect(bitmap.width).toBe(3);
    expect(bitmap.height).toBe(2);
    expect(bitmap.data).toHaveLength(3 * 2 * 4);
  });

  it('returns Bitmap matching the resource dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const resource = createImageResource(canvas);
    const data = captureBitmapFromImageResource(resource);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });
});

describe('createBitmapFromCanvas', () => {
  it('returns Bitmap matching the canvas size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const data = createBitmapFromCanvas(canvas);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });

  it('returns a Bitmap with data length matching canvas pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const data = createBitmapFromCanvas(canvas);
    expect(data.data.length).toBe(8 * 8 * 4);
  });

  it('returns only the requested subrectangle', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;

    const data = createBitmapFromCanvas(canvas, 2, 1, 2, 3);

    expect(data.width).toBe(2);
    expect(data.height).toBe(3);
    expect(data.data).toHaveLength(2 * 3 * 4);
  });

  it('rejects a zero-area read like a browser canvas', () => {
    const context = document.createElement('canvas').getContext('2d')!;
    const callWithTooFewArguments = context.getImageData as unknown as (...args: number[]) => ImageData;

    expect(() => callWithTooFewArguments(0, 0, 1)).toThrowError(TypeError);
    expect(() => context.getImageData(0, 0, 0, 1)).toThrowError(DOMException);
    expect(() => context.getImageData(0, 0, 1, 0)).toThrowError(DOMException);
  });
});

describe('createBitmapFromImageSource', () => {
  it('captures a canvas image source at the given device size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const bitmap = createBitmapFromImageSource(canvas, 8, 4);
    expect(bitmap).not.toBeNull();
    expect(bitmap!.width).toBe(8);
    expect(bitmap!.height).toBe(4);
    expect(bitmap!.data.length).toBe(8 * 4 * 4);
  });

  it('returns null rather than letting a tainted source throw', () => {
    // A cross-origin draw taints the scratch canvas and the platform refuses its pixels with a
    // SecurityError from getImageData. jsdom does not model tainting, so the throw is staged on
    // getImageData directly — which is the exact call and the exact exception the sentinel exists to
    // stop escaping to a caller who only asked for a bitmap.
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const spy = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    try {
      expect(() => createBitmapFromImageSource(canvas, 8, 4)).not.toThrow();
      expect(createBitmapFromImageSource(canvas, 8, 4)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('returns null for an empty capture rather than allocating a zero-pixel bitmap', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    expect(createBitmapFromImageSource(canvas, 0, 4)).toBeNull();
    expect(createBitmapFromImageSource(canvas, 8, -1)).toBeNull();
  });
});
