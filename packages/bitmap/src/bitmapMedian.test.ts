import { createBitmap } from './bitmap';
import { medianBitmap } from './bitmapMedian';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('medianBitmap', () => {
  it('removes an isolated salt pixel without blurring', () => {
    // 3x3 of black with a single white (R=255) center; the median is black.
    const source = createBitmap(3, 3);
    for (let i = 0; i < 9; i++) source.data[i * 4 + 3] = 255;
    source.data[4 * 4] = 255;
    const out = new Uint8ClampedArray(3 * 3 * 4);
    medianBitmap(out, region(source), 1);
    expect(out[4 * 4]).toBe(0);
  });

  it('preserves a hard edge (median is not an average)', () => {
    // Left half 0, right half 255 across a 4x1 row; the boundary stays crisp.
    const source = createBitmap(4, 1);
    source.data[0] = 0;
    source.data[4] = 0;
    source.data[8] = 255;
    source.data[12] = 255;
    const out = new Uint8ClampedArray(4 * 4);
    medianBitmap(out, region(source), 1);
    expect(out[4]).toBe(0);
    expect(out[8]).toBe(255);
  });

  it('radius 0 copies the source', () => {
    const source = createBitmap(1, 1, 0x123456ff);
    const out = new Uint8ClampedArray(4);
    medianBitmap(out, region(source), 0);
    expect(out[0]).toBe(0x12);
    expect(out[3]).toBe(0xff);
  });
});
