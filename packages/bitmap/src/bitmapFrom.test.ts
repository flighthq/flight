import { createImageResource } from '@flighthq/image/contract';

import { createBitmap } from './bitmap';
import { createBitmapFromCanvas, createBitmapFromImageResource, createBitmapFromImageSource } from './bitmapFrom';

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

describe('createBitmapFromImageResource', () => {
  it('returns Bitmap matching the resource dimensions', () => {
    const resource = createImageResource();
    resource.width = 4;
    resource.height = 4;
    resource.source = null;
    const data = createBitmapFromImageResource(resource);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
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
