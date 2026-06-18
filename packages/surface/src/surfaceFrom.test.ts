import { createImageResource } from '@flighthq/resources';

import { createSurface } from './surface';
import { createImageResourceFromSurface, createSurfaceFromCanvas, createSurfaceFromImageResource } from './surfaceFrom';

describe('createImageResourceFromSurface', () => {
  it('returns an ImageResource with matching dimensions', () => {
    const img = createSurface(4, 4, 0x112233ff);
    const resource = createImageResourceFromSurface(img);
    expect(resource.width).toBe(4);
    expect(resource.height).toBe(4);
    expect(resource.source).not.toBeNull();
  });
});

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

describe('createSurfaceFromImageResource', () => {
  it('returns Surface matching the resource dimensions', () => {
    const resource = createImageResource();
    resource.width = 4;
    resource.height = 4;
    resource.source = null;
    const data = createSurfaceFromImageResource(resource);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });
});
