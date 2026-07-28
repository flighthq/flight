import { createBitmap } from './bitmap';
import { pixelateBitmap } from './bitmapPixelate';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('pixelateBitmap', () => {
  it('averages a block to a single uniform color', () => {
    // 2x1 row: R=0 and R=100; a block of 2 averages both to 50.
    const source = createBitmap(2, 1);
    source.data[0] = 0;
    source.data[4] = 100;
    source.data[3] = 255;
    source.data[7] = 255;
    const out = new Uint8ClampedArray(2 * 4);
    pixelateBitmap(out, region(source), 2);
    expect(out[0]).toBe(50);
    expect(out[4]).toBe(50);
  });

  it('keeps each block independent', () => {
    const source = createBitmap(2, 1);
    source.data[0] = 10;
    source.data[4] = 200;
    const out = new Uint8ClampedArray(2 * 4);
    pixelateBitmap(out, region(source), 1);
    expect(out[0]).toBe(10);
    expect(out[4]).toBe(200);
  });

  it('can use source.bitmap.data as out for a full-bitmap region', () => {
    const bitmap = createBitmap(2, 1);
    bitmap.data[0] = 0;
    bitmap.data[4] = 80;
    pixelateBitmap(bitmap.data, region(bitmap), 2);
    expect(bitmap.data[0]).toBe(40);
    expect(bitmap.data[4]).toBe(40);
  });
});
