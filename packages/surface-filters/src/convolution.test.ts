import { createSurface } from '@flighthq/surface';

import { applySurfaceConvolutionFilter } from './convolution';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('applySurfaceConvolutionFilter', () => {
  it('applies a convolution matrix to the source region', () => {
    const source = createSurface(3, 1);
    source.data[0] = 10;
    source.data[4] = 20;
    source.data[8] = 30;
    const out = new Uint8ClampedArray(4);
    applySurfaceConvolutionFilter(out, region(source, 1, 0, 1, 1), {
      matrix: [1, 1, 1],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(20);
  });

  it('can sample a fill color outside source bounds', () => {
    const source = createSurface(1, 1, 0x000000ff);
    const out = new Uint8ClampedArray(4);
    applySurfaceConvolutionFilter(out, region(source), {
      clamp: false,
      color: 0xff0000ff,
      divisor: 1,
      matrix: [1, 0, 0],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('preserves source alpha by default', () => {
    const source = createSurface(1, 1, 0x00000044);
    const out = new Uint8ClampedArray(4);
    applySurfaceConvolutionFilter(out, region(source), {
      bias: 255,
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    });
    expect(out[3]).toBe(0x44);
  });

  it('throws when matrix dimensions are not positive', () => {
    const source = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    expect(() => applySurfaceConvolutionFilter(out, region(source), { matrix: [], matrixX: 0, matrixY: 1 })).toThrow();
  });

  it('throws when matrix is too short for its declared dimensions', () => {
    const source = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    expect(() => applySurfaceConvolutionFilter(out, region(source), { matrix: [1], matrixX: 3, matrixY: 3 })).toThrow();
  });

  it('treats an explicit divisor of 0 as passthrough (no division by zero)', () => {
    const source = createSurface(1, 1, 0x804020ff);
    const out = new Uint8ClampedArray(4);
    applySurfaceConvolutionFilter(out, region(source), {
      divisor: 0,
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(0x80);
    expect(Number.isNaN(out[0])).toBe(false);
  });
});
