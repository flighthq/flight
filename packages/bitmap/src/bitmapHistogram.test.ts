import { createBitmap } from './bitmap';
import { equalizeBitmapHistogram, getBitmapHistogram } from './bitmapHistogram';
import { setBitmapPixel } from './bitmapPixel';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('equalizeBitmapHistogram', () => {
  it('spreads a narrow tonal range to fill 0..255', () => {
    // All red values are either 0 or 128 — a compressed range.
    const source = createBitmap(2, 1);
    setBitmapPixel(source, 0, 0, 0x000000ff);
    setBitmapPixel(source, 1, 0, 0x808000ff);
    const dest = createBitmap(2, 1);
    equalizeBitmapHistogram(region(dest), region(source));
    // After equalization the darker pixel maps to 0 and brighter to 255
    expect(dest.data[0]).toBe(0);
    expect(dest.data[4]).toBe(255);
  });

  it('is safe in-place', () => {
    const bitmap = createBitmap(2, 1);
    setBitmapPixel(bitmap, 0, 0, 0x000000ff);
    setBitmapPixel(bitmap, 1, 0, 0xff0000ff);
    expect(() => equalizeBitmapHistogram(region(bitmap), region(bitmap))).not.toThrow();
  });

  it('preserves alpha unchanged', () => {
    const source = createBitmap(1, 1, 0x40404080);
    const dest = createBitmap(1, 1);
    equalizeBitmapHistogram(region(dest), region(source));
    expect(dest.data[3]).toBe(0x80);
  });
});

describe('getBitmapHistogram', () => {
  it('counts pixel values per channel', () => {
    const bitmap = createBitmap(2, 1);
    setBitmapPixel(bitmap, 0, 0, 0x0a000000);
    setBitmapPixel(bitmap, 1, 0, 0x0a0000ff);
    const histogram = getBitmapHistogram(region(bitmap));
    expect(histogram.red[0x0a]).toBe(2);
    expect(histogram.alpha[0]).toBe(1);
    expect(histogram.alpha[255]).toBe(1);
    expect(histogram.green[0]).toBe(2);
  });

  it('returns all-zero bins for an empty region', () => {
    const bitmap = createBitmap(2, 2, 0xffffffff);
    const histogram = getBitmapHistogram(region(bitmap, 0, 0, 0, 0));
    expect(histogram.red.reduce((a, b) => a + b, 0)).toBe(0);
    expect(histogram.red.length).toBe(256);
  });

  it('counts only a sub-region', () => {
    const bitmap = createBitmap(2, 1);
    setBitmapPixel(bitmap, 0, 0, 0x10000000);
    setBitmapPixel(bitmap, 1, 0, 0x20000000);
    const histogram = getBitmapHistogram(region(bitmap, 1, 0, 1, 1));
    expect(histogram.red[0x20]).toBe(1);
    expect(histogram.red[0x10]).toBe(0);
  });
});
