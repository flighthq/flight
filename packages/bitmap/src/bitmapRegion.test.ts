import { createBitmap } from './bitmap';
import { createBitmapRegion, setBitmapRegion } from './bitmapRegion';

describe('createBitmapRegion', () => {
  it('covers the whole bitmap when no bounds are given', () => {
    const bitmap = createBitmap(7, 5);
    const r = createBitmapRegion(bitmap);
    expect(r).toEqual({ bitmap, x: 0, y: 0, width: 7, height: 5 });
  });

  it('uses the supplied bounds', () => {
    const bitmap = createBitmap(8, 8);
    const r = createBitmapRegion(bitmap, 1, 2, 3, 4);
    expect(r).toEqual({ bitmap, x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('setBitmapRegion', () => {
  it('mutates the existing region without allocating a new object', () => {
    const bitmap = createBitmap(8, 8);
    const r = createBitmapRegion(bitmap);
    const returned = setBitmapRegion(r, bitmap, 2, 3, 4, 5);
    expect(returned).toBe(r);
    expect(r).toEqual({ bitmap, x: 2, y: 3, width: 4, height: 5 });
  });

  it('covers the whole bitmap when no bounds are given', () => {
    const a = createBitmap(2, 2);
    const b = createBitmap(6, 9);
    const r = createBitmapRegion(a);
    setBitmapRegion(r, b);
    expect(r).toEqual({ bitmap: b, x: 0, y: 0, width: 6, height: 9 });
  });
});
