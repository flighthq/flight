import { createBitmap } from './bitmap';
import { fillBitmapRectangle } from './bitmapFill';
import { getBitmapColorBoundsRectangle } from './bitmapQuery';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('getBitmapColorBoundsRectangle', () => {
  it('returns null when no pixels match', () => {
    const img = createBitmap(4, 4);
    expect(getBitmapColorBoundsRectangle(region(img), 0xffffffff, 0xffffffff)).toBeNull();
  });

  it('finds the bounding rect of matching pixels', () => {
    const img = createBitmap(8, 8);
    fillBitmapRectangle(region(img, 2, 3, 3, 2), 0xff0000ff);
    const rect = getBitmapColorBoundsRectangle(region(img), 0xffffffff, 0xff0000ff);
    expect(rect).toEqual({ x: 2, y: 3, width: 3, height: 2 });
  });

  it('finds non-matching pixels when findColor is false', () => {
    const img = createBitmap(4, 4, 0xffffffff);
    fillBitmapRectangle(region(img, 1, 1, 2, 2), 0x000000ff);
    const rect = getBitmapColorBoundsRectangle(region(img), 0xffffffff, 0xffffffff, false);
    expect(rect).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it('respects the mask', () => {
    const img = createBitmap(2, 2);
    fillBitmapRectangle(region(img), 0x112233ff);
    const rect = getBitmapColorBoundsRectangle(region(img), 0xff0000ff, 0x110000ff);
    expect(rect).not.toBeNull();
  });

  it('reports bitmap-absolute coordinates when scanning a sub-region', () => {
    const img = createBitmap(8, 8);
    fillBitmapRectangle(region(img, 5, 5, 2, 2), 0xff0000ff);
    const rect = getBitmapColorBoundsRectangle(region(img, 4, 4, 4, 4), 0xffffffff, 0xff0000ff);
    expect(rect).toEqual({ x: 5, y: 5, width: 2, height: 2 });
  });
});
