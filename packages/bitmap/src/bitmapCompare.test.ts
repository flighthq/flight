import type { Bitmap } from '@flighthq/types/contract';

import { cloneBitmap, createBitmap } from './bitmap';
import { compareBitmap, getBitmapMismatch } from './bitmapCompare';
import { setBitmapPixel } from './bitmapPixel';

describe('compareBitmap', () => {
  it('throws when widths differ', () => {
    const a = createBitmap(4, 4);
    const b = createBitmap(8, 4);
    expect(() => compareBitmap(a, b)).toThrow();
  });

  it('throws when heights differ', () => {
    const a = createBitmap(4, 4);
    const b = createBitmap(4, 8);
    expect(() => compareBitmap(a, b)).toThrow();
  });

  it('returns null for identical images', () => {
    const a = createBitmap(4, 4, 0x0000ffff);
    const b = cloneBitmap(a);
    expect(compareBitmap(a, b)).toBeNull();
  });

  it('returns diff Bitmap for different pixels', () => {
    const a = createBitmap(2, 1, 0x000000ff);
    const b = createBitmap(2, 1, 0x000000ff);
    setBitmapPixel(b, 0, 0, 0x102030ff);
    const result = compareBitmap(a, b) as Bitmap;
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    expect(result.data[0]).toBe(0x10);
    expect(result.data[1]).toBe(0x20);
    expect(result.data[2]).toBe(0x30);
    expect(result.data[3]).toBe(255);
    expect(result.data[4]).toBe(0);
    expect(result.data[5]).toBe(0);
    expect(result.data[6]).toBe(0);
    expect(result.data[7]).toBe(0);
  });

  it('diff pixel alpha is 255 when any channel differs', () => {
    const a = createBitmap(1, 1, 0x000000ff);
    const b = createBitmap(1, 1, 0x00000080);
    const result = compareBitmap(a, b) as Bitmap;
    expect(result.data[3]).toBe(255);
  });

  it('unchanged pixels in diff have zero alpha', () => {
    const a = createBitmap(2, 1, 0x000000ff);
    const b = cloneBitmap(a);
    setBitmapPixel(b, 1, 0, 0xff0000ff);
    const result = compareBitmap(a, b) as Bitmap;
    expect(result.data[3]).toBe(0);
    expect(result.data[7]).toBe(255);
  });
});

describe('getBitmapMismatch', () => {
  it('accepts decoded Uint8Array pixels as well as Bitmap clamped storage', () => {
    const decoded = { width: 1, height: 1, data: new Uint8Array([10, 20, 30, 255]) };
    const bitmap = createBitmap(1, 1, 0x0a141eff);

    expect(getBitmapMismatch(decoded, bitmap)).toEqual({
      fraction: 0,
      maxChannelDelta: 0,
      mismatchedPixels: 0,
      totalPixels: 1,
    });
  });

  it('throws when dimensions differ', () => {
    expect(() => getBitmapMismatch(createBitmap(4, 4), createBitmap(4, 8))).toThrow();
  });

  it('reports zero mismatch for identical bitmaps', () => {
    const a = createBitmap(4, 4, 0x0000ffff);
    const result = getBitmapMismatch(a, cloneBitmap(a));
    expect(result.mismatchedPixels).toBe(0);
    expect(result.totalPixels).toBe(16);
    expect(result.fraction).toBe(0);
    expect(result.maxChannelDelta).toBe(0);
  });

  it('counts pixels whose max channel delta exceeds the tolerance', () => {
    const a = createBitmap(2, 1, 0x000000ff);
    const b = createBitmap(2, 1, 0x000000ff);
    setBitmapPixel(b, 0, 0, 0x0a0000ff); // delta 10 on one channel
    expect(getBitmapMismatch(a, b, 0).mismatchedPixels).toBe(1);
    expect(getBitmapMismatch(a, b, 9).mismatchedPixels).toBe(1);
    expect(getBitmapMismatch(a, b, 10).mismatchedPixels).toBe(0); // within tolerance
  });

  it('reports the largest channel delta and the mismatch fraction', () => {
    const a = createBitmap(2, 1, 0x000000ff);
    const b = createBitmap(2, 1, 0x000000ff);
    setBitmapPixel(b, 1, 0, 0x804020ff); // max delta 0x80 = 128
    const result = getBitmapMismatch(a, b);
    expect(result.maxChannelDelta).toBe(128);
    expect(result.mismatchedPixels).toBe(1);
    expect(result.fraction).toBe(0.5);
  });
});
