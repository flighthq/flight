import { createImageResource } from '@flighthq/image/contract';

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
});

describe('createBitmapFromImageSource', () => {
  it('captures a canvas image source at the given device size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const bitmap = createBitmapFromImageSource(canvas, 8, 4);
    expect(bitmap.width).toBe(8);
    expect(bitmap.height).toBe(4);
    expect(bitmap.data.length).toBe(8 * 4 * 4);
  });
});
