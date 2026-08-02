import { createBitmap } from './bitmap';
import { cropBitmap, extendBitmap, trimBitmap } from './bitmapCrop';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';

describe('cropBitmap', () => {
  it('returns a bitmap with the requested dimensions', () => {
    const src = createBitmap(10, 10, 0xff0000ff);
    const out = cropBitmap(src, { x: 2, y: 3, width: 4, height: 5 });
    expect(out.width).toBe(4);
    expect(out.height).toBe(5);
  });

  it('copies pixels from the source region', () => {
    const src = createBitmap(4, 4);
    setBitmapPixel(src, 2, 1, 0x00ff00ff);
    const out = cropBitmap(src, { x: 2, y: 1, width: 2, height: 2 });
    expect(getBitmapPixel(out, 0, 0)).toBe(0x00ff00ff);
  });

  it('fills pixels outside the source with transparent black', () => {
    const src = createBitmap(2, 2, 0xffffffff);
    // Crop region extends beyond source.
    const out = cropBitmap(src, { x: 1, y: 1, width: 3, height: 3 });
    // (0,0) is inside source — opaque white.
    expect(getBitmapPixel(out, 0, 0)).toBe(0xffffffff);
    // (2,2) is outside source — transparent black.
    expect(getBitmapPixel(out, 2, 2)).toBe(0x00000000);
  });

  it('preserves source gamut and alphaType', () => {
    const src = createBitmap(2, 2, 0xff0000ff);
    const out = cropBitmap(src, { x: 0, y: 0, width: 2, height: 2 });
    expect(out.gamut).toBe(src.gamut);
    expect(out.alphaType).toBe(src.alphaType);
  });

  it('returns a distinct bitmap object', () => {
    const src = createBitmap(2, 2, 0xff0000ff);
    const out = cropBitmap(src, { x: 0, y: 0, width: 2, height: 2 });
    expect(out).not.toBe(src);
    expect(out.data).not.toBe(src.data);
  });
});

describe('extendBitmap', () => {
  it('returns a bitmap padded by the correct number of pixels', () => {
    const src = createBitmap(2, 2, 0x0000ffff);
    const out = extendBitmap(src, 1, 2, 3, 4);
    expect(out.width).toBe(2 + 1 + 3);
    expect(out.height).toBe(2 + 2 + 4);
  });

  it('copies source pixels into the center region', () => {
    const src = createBitmap(2, 2, 0xabcdefff);
    const out = extendBitmap(src, 1, 1, 1, 1);
    expect(getBitmapPixel(out, 1, 1)).toBe(0xabcdefff);
  });

  it('transparent edge mode fills padding with transparent black by default', () => {
    const src = createBitmap(2, 2, 0xff0000ff);
    const out = extendBitmap(src, 1, 1, 1, 1);
    expect(getBitmapPixel(out, 0, 0)).toBe(0x00000000);
  });

  it('transparent edge mode uses fillColor when provided', () => {
    const src = createBitmap(2, 2, 0xff0000ff);
    const out = extendBitmap(src, 1, 1, 1, 1, 'transparent', 0xffffffff);
    expect(getBitmapPixel(out, 0, 0)).toBe(0xffffffff);
  });

  it('clamp edge mode repeats border pixels in padding', () => {
    const src = createBitmap(2, 2, 0x0000ffff);
    // Set a distinct border pixel.
    setBitmapPixel(src, 0, 0, 0x123456ff);
    const out = extendBitmap(src, 1, 1, 0, 0, 'clamp');
    // Top-left padding comes from source (0,0).
    expect(getBitmapPixel(out, 0, 0)).toBe(0x123456ff);
  });

  it('wrap edge mode tiles the source in padding', () => {
    const src = createBitmap(2, 2);
    setBitmapPixel(src, 0, 0, 0xff0000ff);
    setBitmapPixel(src, 1, 0, 0x00ff00ff);
    // Extend by 2 on the right → first padding column maps to source col 0.
    const out = extendBitmap(src, 0, 0, 2, 0, 'wrap');
    expect(getBitmapPixel(out, 2, 0)).toBe(0xff0000ff);
    expect(getBitmapPixel(out, 3, 0)).toBe(0x00ff00ff);
  });
});

describe('trimBitmap', () => {
  it('removes transparent border rows and columns', () => {
    const src = createBitmap(5, 5);
    // Only pixel (2,2) is non-transparent.
    setBitmapPixel(src, 2, 2, 0xff0000ff);
    const out = trimBitmap(src);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(getBitmapPixel(out, 0, 0)).toBe(0xff0000ff);
  });

  it('returns a 1×1 transparent bitmap for a fully transparent input', () => {
    const src = createBitmap(3, 3);
    const out = trimBitmap(src);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(getBitmapPixel(out, 0, 0) & 0xff).toBe(0);
  });

  it('returns a bitmap equal to the source when there is no transparent border', () => {
    const src = createBitmap(2, 2, 0xff0000ff);
    const out = trimBitmap(src);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
  });
});
