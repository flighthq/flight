import { createImageSource } from '@flighthq/assets';
import { describe, expect, it } from 'vitest';

import { createSurface } from './surface';
import { createImageSourceFromSurface, createSurfaceFromCanvas, createSurfaceFromImageSource } from './surfaceFrom';

describe('createSurfaceFromCanvas', () => {
  it('returns Surface matching the canvas size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const data = createSurfaceFromCanvas(canvas);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });

  it('returns a Surface with data length matching canvas pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const data = createSurfaceFromCanvas(canvas);
    expect(data.data.length).toBe(8 * 8 * 4);
  });
});

describe('createSurfaceFromImageSource', () => {
  it('returns Surface matching the source dimensions', () => {
    const source = createImageSource();
    source.width = 4;
    source.height = 4;
    source.src = null;
    const data = createSurfaceFromImageSource(source);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });
});

describe('createImageSourceFromSurface', () => {
  it('returns an ImageSource with matching dimensions', () => {
    const img = createSurface(4, 4, 0xff112233);
    const source = createImageSourceFromSurface(img);
    expect(source.width).toBe(4);
    expect(source.height).toBe(4);
    expect(source.src).not.toBeNull();
  });
});
