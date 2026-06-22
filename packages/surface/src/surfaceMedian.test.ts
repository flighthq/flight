import { createSurface } from './surface';
import { medianSurface } from './surfaceMedian';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('medianSurface', () => {
  it('removes an isolated salt pixel without blurring', () => {
    // 3x3 of black with a single white (R=255) center; the median is black.
    const source = createSurface(3, 3);
    for (let i = 0; i < 9; i++) source.data[i * 4 + 3] = 255;
    source.data[4 * 4] = 255;
    const out = new Uint8ClampedArray(3 * 3 * 4);
    medianSurface(out, region(source), 1);
    expect(out[4 * 4]).toBe(0);
  });

  it('preserves a hard edge (median is not an average)', () => {
    // Left half 0, right half 255 across a 4x1 row; the boundary stays crisp.
    const source = createSurface(4, 1);
    source.data[0] = 0;
    source.data[4] = 0;
    source.data[8] = 255;
    source.data[12] = 255;
    const out = new Uint8ClampedArray(4 * 4);
    medianSurface(out, region(source), 1);
    expect(out[4]).toBe(0);
    expect(out[8]).toBe(255);
  });

  it('radius 0 copies the source', () => {
    const source = createSurface(1, 1, 0x123456ff);
    const out = new Uint8ClampedArray(4);
    medianSurface(out, region(source), 0);
    expect(out[0]).toBe(0x12);
    expect(out[3]).toBe(0xff);
  });
});
