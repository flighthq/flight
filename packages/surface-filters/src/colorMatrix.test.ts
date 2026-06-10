import { createSurface } from '@flighthq/surface/surface';

import { applySurfaceColorMatrixFilter } from './colorMatrix';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('applySurfaceColorMatrixFilter', () => {
  it('applies a 4x5 color matrix to the source region', () => {
    const source = createSurface(1, 1, 0x204060ff);
    const out = new Uint8ClampedArray(4);
    applySurfaceColorMatrixFilter(out, region(source), [0, 0, 0, 0, 10, 0, 0, 0, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0, 1, 0]);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(20);
    expect(out[2]).toBe(30);
    expect(out[3]).toBe(0xff);
  });

  it('is safe when out aliases source.surface.data for a full-surface region', () => {
    const surface = createSurface(1, 1, 0x010203ff);
    applySurfaceColorMatrixFilter(
      surface.data,
      region(surface),
      [1, 0, 0, 0, 10, 0, 1, 0, 0, 20, 0, 0, 1, 0, 30, 0, 0, 0, 1, 0],
    );
    expect(surface.data[0]).toBe(11);
    expect(surface.data[1]).toBe(22);
    expect(surface.data[2]).toBe(33);
    expect(surface.data[3]).toBe(0xff);
  });

  it('clamps output to [0, 255]', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const out = new Uint8ClampedArray(4);
    applySurfaceColorMatrixFilter(
      out,
      region(source),
      [10, 0, 0, 0, 100, 0, 0, 0, 0, -50, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    );
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
  });

  it('throws when the matrix is too short', () => {
    const source = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    expect(() => applySurfaceColorMatrixFilter(out, region(source), [])).toThrow(
      'Color matrix filter requires 20 values',
    );
  });

  it('silently skips pixels outside source bounds', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const out = new Uint8ClampedArray(4 * 4);
    const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    applySurfaceColorMatrixFilter(out, region(source, -1, -1, 2, 2), identity);
    // only bottom-right pixel of the 2x2 region is in-bounds
    const i = (1 * 2 + 1) * 4;
    expect(out[i]).toBe(0xff);
    expect(out[0]).toBe(0);
  });
});
