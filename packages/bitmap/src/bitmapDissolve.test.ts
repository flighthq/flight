import { createBitmap } from './bitmap';
import { dissolveBitmapPixels } from './bitmapDissolve';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';
import { createBitmapRegion } from './bitmapRegion';

function countChangedPixels(data: Readonly<Uint8ClampedArray>, original: Readonly<Uint8ClampedArray>): number {
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] !== original[i] ||
      data[i + 1] !== original[i + 1] ||
      data[i + 2] !== original[i + 2] ||
      data[i + 3] !== original[i + 3]
    ) {
      changed++;
    }
  }
  return changed;
}

describe('dissolveBitmapPixels', () => {
  it('dissolves at most pixelCount pixels per call', () => {
    const source = createBitmap(4, 4, 0x112233ff);
    const dest = createBitmap(4, 4, 0x00000000);
    const original = dest.data.slice();
    dissolveBitmapPixels(createBitmapRegion(dest), createBitmapRegion(source), 0, 5);
    expect(countChangedPixels(dest.data, original)).toBe(5);
  });

  it('eventually covers every pixel exactly once so dest matches source', () => {
    const source = createBitmap(5, 3);
    for (let i = 0; i < 5 * 3; i++) setBitmapPixel(source, i % 5, (i / 5) | 0, (0x01010100 * (i + 1)) >>> 0);
    const dest = createBitmap(5, 3, 0x00000000);
    const sourceRegion = createBitmapRegion(source);
    const destRegion = createBitmapRegion(dest);

    let seed = 0;
    for (let call = 0; call < 8; call++) seed = dissolveBitmapPixels(destRegion, sourceRegion, seed, 2);

    expect(Array.from(dest.data)).toEqual(Array.from(source.data));
  });

  it('is deterministic for the same seed sequence', () => {
    const source = createBitmap(6, 6, 0xaabbccff);
    const a = createBitmap(6, 6, 0x00000000);
    const b = createBitmap(6, 6, 0x00000000);
    const sourceRegion = createBitmapRegion(source);
    dissolveBitmapPixels(createBitmapRegion(a), sourceRegion, 3, 7);
    dissolveBitmapPixels(createBitmapRegion(b), sourceRegion, 3, 7);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('returns a terminal seed once fully dissolved that no-ops on reuse', () => {
    const source = createBitmap(4, 4, 0x445566ff);
    const dest = createBitmap(4, 4, 0x00000000);
    const sourceRegion = createBitmapRegion(source);
    const destRegion = createBitmapRegion(dest);

    let seed = 0;
    for (let call = 0; call < 16; call++) seed = dissolveBitmapPixels(destRegion, sourceRegion, seed, 1);
    expect(Array.from(dest.data)).toEqual(Array.from(source.data));

    const afterComplete = dissolveBitmapPixels(destRegion, sourceRegion, seed, 4);
    expect(afterComplete).toBe(seed);
  });

  it('dissolves toward fillColor when source and dest are the same region', () => {
    const bitmap = createBitmap(3, 3, 0x112233ff);
    const region = createBitmapRegion(bitmap);
    let seed = 0;
    for (let call = 0; call < 9; call++) seed = dissolveBitmapPixels(region, region, seed, 1, 0x99887766);
    for (let i = 0; i < 9; i++) expect(getBitmapPixel(bitmap, i % 3, (i / 3) | 0)).toBe(0x99887766);
  });

  it('ignores fillColor and copies from source when regions differ', () => {
    const source = createBitmap(2, 2, 0x0a0b0c0d);
    const dest = createBitmap(2, 2, 0x00000000);
    let seed = 0;
    for (let call = 0; call < 4; call++) {
      seed = dissolveBitmapPixels(createBitmapRegion(dest), createBitmapRegion(source), seed, 1, 0xffffffff);
    }
    expect(Array.from(dest.data)).toEqual(Array.from(source.data));
  });

  it('returns the seed unchanged for a non-positive pixelCount without writing', () => {
    const source = createBitmap(4, 4, 0x112233ff);
    const dest = createBitmap(4, 4, 0x00000000);
    const original = dest.data.slice();
    expect(dissolveBitmapPixels(createBitmapRegion(dest), createBitmapRegion(source), 2, 0)).toBe(2);
    expect(countChangedPixels(dest.data, original)).toBe(0);
  });

  it('returns the seed for a zero-area region', () => {
    const source = createBitmap(4, 4, 0x112233ff);
    const dest = createBitmap(4, 4, 0x00000000);
    const region = createBitmapRegion(dest, 0, 0, 0, 0);
    expect(dissolveBitmapPixels(region, createBitmapRegion(source), 5, 10)).toBe(5);
  });
});
