import { createImageResource } from '@flighthq/image/contract';
import type { BitmapReadbackBackend, HasGraphicsBitmapReadback } from '@flighthq/types/contract';
import { vi } from 'vitest';

import { createBitmap } from './bitmap';
import {
  captureBitmapFromImageResource,
  createBitmapFromCanvas,
  createBitmapFromImageSource,
  initializeBitmapFromCanvas,
} from './bitmapFrom';

function hostWith(backend: BitmapReadbackBackend): HasGraphicsBitmapReadback {
  return { graphics: { bitmapReadback: backend } } as HasGraphicsBitmapReadback;
}

describe('captureBitmapFromImageResource', () => {
  it('passes the resource source and dimensions through the host readback backend', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 2;
    const bitmap = createBitmap(3, 2);
    const readBitmap = vi.fn(() => ({ bitmap, reason: 'ok' as const }));
    const host = hostWith({ readBitmap });

    expect(captureBitmapFromImageResource(host, createImageResource(canvas))).toBe(bitmap);
    expect(readBitmap).toHaveBeenCalledOnce();
    expect(readBitmap).toHaveBeenCalledWith(canvas, 3, 2, 'bitmap');
  });

  it('returns null for an expected backend refusal', () => {
    const host = hostWith({
      readBitmap: vi.fn(() => ({ bitmap: null, reason: 'tainted-source' as const })),
    });
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;

    expect(captureBitmapFromImageResource(host, createImageResource(canvas))).toBeNull();
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
  it('returns the exact Bitmap from the host backend outcome', () => {
    const expected = createBitmap(8, 4);
    const host = hostWith({
      readBitmap: vi.fn(() => ({ bitmap: expected, reason: 'ok' as const })),
    });

    expect(createBitmapFromImageSource(host, document.createElement('canvas'), 8, 4)).toBe(expected);
  });
});
describe('initializeBitmapFromCanvas', () => {
  it('is the construction initializer of createBitmapFromCanvas', () => {
    expect(typeof initializeBitmapFromCanvas).toBe('function');
  });
});
