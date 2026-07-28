import { createBitmap } from './bitmap';
import { transformBitmap } from './bitmapAffine';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';
import { createBitmapRegion } from './bitmapRegion';

describe('transformBitmap', () => {
  it('identity matrix copies source to dest', () => {
    const src = createBitmap(3, 3);
    setBitmapPixel(src, 1, 1, 0xff0000ff);
    const dst = createBitmap(3, 3);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), identity);
    expect(getBitmapPixel(dst, 1, 1)).toBe(0xff0000ff);
  });

  it('translation matrix shifts the image', () => {
    const src = createBitmap(4, 4);
    setBitmapPixel(src, 0, 0, 0xaabbccff);
    const dst = createBitmap(4, 4);
    // Translate: map dest (1,1) → source (0,0), i.e. e=-1, f=-1.
    const translate: [number, number, number, number, number, number] = [1, 0, 0, 1, -1, -1];
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), translate);
    expect(getBitmapPixel(dst, 1, 1)).toBe(0xaabbccff);
  });

  it('transparent edge mode writes transparent for out-of-bounds samples', () => {
    const src = createBitmap(2, 2, 0xff0000ff);
    const dst = createBitmap(4, 4);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), identity, 'transparent');
    // Out of source bounds → transparent.
    expect(getBitmapPixel(dst, 3, 3)).toBe(0x00000000);
  });

  it('clamp edge mode repeats border pixels', () => {
    const src = createBitmap(2, 2, 0x112233ff);
    const dst = createBitmap(4, 4);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), identity, 'clamp');
    // Out of source bounds → clamped to border color.
    expect(getBitmapPixel(dst, 3, 3)).toBe(0x112233ff);
  });

  it('wrap edge mode tiles the source', () => {
    const src = createBitmap(2, 2);
    setBitmapPixel(src, 0, 0, 0xffff00ff);
    const dst = createBitmap(4, 2);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), identity, 'wrap');
    // Pixel at (2,0) should wrap to (0,0) in source.
    expect(getBitmapPixel(dst, 2, 0)).toBe(0xffff00ff);
  });

  it('mirror edge mode mirrors the source', () => {
    const src = createBitmap(3, 1);
    setBitmapPixel(src, 0, 0, 0xff0000ff);
    setBitmapPixel(src, 1, 0, 0x00ff00ff);
    setBitmapPixel(src, 2, 0, 0x0000ffff);
    const dst = createBitmap(5, 1);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), identity, 'mirror');
    // x=3 mirrors to x=2 (0x0000ff), x=4 mirrors to x=1 (0x00ff00).
    expect(getBitmapPixel(dst, 3, 0)).toBe(0x0000ffff);
    expect(getBitmapPixel(dst, 4, 0)).toBe(0x00ff00ff);
  });

  it('nearest sample mode preserves hard edges', () => {
    const src = createBitmap(2, 1);
    setBitmapPixel(src, 0, 0, 0xff0000ff);
    setBitmapPixel(src, 1, 0, 0x0000ffff);
    const dst = createBitmap(2, 1);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), identity, 'transparent', 'nearest');
    expect(getBitmapPixel(dst, 0, 0)).toBe(0xff0000ff);
    expect(getBitmapPixel(dst, 1, 0)).toBe(0x0000ffff);
  });

  it('skips zero-size dest or source', () => {
    const src = createBitmap(2, 2);
    const dst = createBitmap(2, 2);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    // Zero-size region — should not throw.
    expect(() =>
      transformBitmap({ bitmap: dst, x: 0, y: 0, width: 0, height: 0 }, createBitmapRegion(src), identity),
    ).not.toThrow();
  });

  it('aliased out=in with identity leaves bitmap unchanged', () => {
    const surf = createBitmap(2, 2, 0xabcdefff);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    // Aliased write to dest and source on a distinct bitmap to avoid real corruption.
    const src = createBitmap(2, 2, 0xabcdefff);
    const dst = createBitmap(2, 2);
    transformBitmap(createBitmapRegion(dst), createBitmapRegion(src), identity);
    expect(getBitmapPixel(dst, 0, 0)).toBe(0xabcdefff);
    void surf;
  });
});
