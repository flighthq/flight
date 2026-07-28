import { createBitmap } from './bitmap';
import { copyBitmapAlpha, multiplyBitmapAlpha, setBitmapAlpha } from './bitmapAlpha';
import { getBitmapPixel, setBitmapPixel } from './bitmapPixel';
import { createBitmapRegion } from './bitmapRegion';

describe('copyBitmapAlpha', () => {
  it('copies alpha from source to dest, leaving RGB unchanged', () => {
    const src = createBitmap(2, 1);
    setBitmapPixel(src, 0, 0, 0x00000080); // alpha 0x80
    setBitmapPixel(src, 1, 0, 0x000000ff); // alpha 0xff
    const dst = createBitmap(2, 1, 0xff00ffff); // red pixels, fully opaque
    copyBitmapAlpha(createBitmapRegion(dst), createBitmapRegion(src));
    // RGB unchanged, alpha from source.
    expect((getBitmapPixel(dst, 0, 0) >>> 24) & 0xff).toBe(0xff); // red channel
    expect(getBitmapPixel(dst, 0, 0) & 0xff).toBe(0x80); // alpha
    expect(getBitmapPixel(dst, 1, 0) & 0xff).toBe(0xff);
  });

  it('same-bitmap region is a no-op on alpha', () => {
    const surf = createBitmap(2, 1, 0x112233aa);
    copyBitmapAlpha(createBitmapRegion(surf), createBitmapRegion(surf));
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(0xaa);
  });

  it('operates only on the overlap of both regions', () => {
    const src = createBitmap(3, 1, 0x00000080);
    const dst = createBitmap(3, 1, 0x00000000);
    // Copy only 1 pixel wide.
    copyBitmapAlpha({ bitmap: dst, x: 0, y: 0, width: 1, height: 1 }, { bitmap: src, x: 0, y: 0, width: 1, height: 1 });
    expect(getBitmapPixel(dst, 0, 0) & 0xff).toBe(0x80);
    expect(getBitmapPixel(dst, 1, 0) & 0xff).toBe(0x00); // untouched
  });
});

describe('multiplyBitmapAlpha', () => {
  it('factor 0 makes region fully transparent', () => {
    const surf = createBitmap(2, 2, 0xff0000ff);
    multiplyBitmapAlpha(createBitmapRegion(surf), 0);
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(0);
    expect(getBitmapPixel(surf, 1, 1) & 0xff).toBe(0);
  });

  it('factor 1 leaves alpha unchanged', () => {
    const surf = createBitmap(1, 1, 0xff0000ab);
    multiplyBitmapAlpha(createBitmapRegion(surf), 1);
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(0xab);
  });

  it('factor 0.5 halves the alpha', () => {
    const surf = createBitmap(1, 1, 0xff0000fe);
    multiplyBitmapAlpha(createBitmapRegion(surf), 0.5);
    // 0xfe * 0.5 = 127
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(127);
  });

  it('clamps factor to [0, 1]', () => {
    const surf = createBitmap(1, 1, 0xff0000aa);
    multiplyBitmapAlpha(createBitmapRegion(surf), 2);
    // Factor clamped to 1, alpha unchanged.
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(0xaa);
  });

  it('leaves RGB channels unchanged', () => {
    const surf = createBitmap(1, 1, 0x123456ff);
    multiplyBitmapAlpha(createBitmapRegion(surf), 0.5);
    const p = getBitmapPixel(surf, 0, 0);
    expect((p >>> 24) & 0xff).toBe(0x12);
    expect((p >> 16) & 0xff).toBe(0x34);
    expect((p >> 8) & 0xff).toBe(0x56);
  });
});

describe('setBitmapAlpha', () => {
  it('writes a constant alpha to all pixels in region', () => {
    const surf = createBitmap(3, 3, 0xff0000ff);
    setBitmapAlpha(createBitmapRegion(surf), 0x40);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(getBitmapPixel(surf, x, y) & 0xff).toBe(0x40);
      }
    }
  });

  it('leaves RGB unchanged', () => {
    const surf = createBitmap(1, 1, 0x112233ff);
    setBitmapAlpha(createBitmapRegion(surf), 0x80);
    const p = getBitmapPixel(surf, 0, 0);
    expect((p >>> 24) & 0xff).toBe(0x11);
    expect((p >> 16) & 0xff).toBe(0x22);
    expect((p >> 8) & 0xff).toBe(0x33);
    expect(p & 0xff).toBe(0x80);
  });

  it('clamps alpha to [0, 255]', () => {
    const surf = createBitmap(1, 1, 0xff0000ff);
    setBitmapAlpha(createBitmapRegion(surf), -10);
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(0);
    setBitmapAlpha(createBitmapRegion(surf), 300);
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(255);
  });

  it('only affects the specified sub-region', () => {
    const surf = createBitmap(4, 1, 0xff0000ff);
    setBitmapAlpha({ bitmap: surf, x: 1, y: 0, width: 2, height: 1 }, 0x00);
    expect(getBitmapPixel(surf, 0, 0) & 0xff).toBe(0xff); // untouched
    expect(getBitmapPixel(surf, 1, 0) & 0xff).toBe(0x00);
    expect(getBitmapPixel(surf, 2, 0) & 0xff).toBe(0x00);
    expect(getBitmapPixel(surf, 3, 0) & 0xff).toBe(0xff); // untouched
  });
});
