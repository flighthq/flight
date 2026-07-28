import { createBitmap } from './bitmap';
import { getBitmapCoverage } from './bitmapCoverage';
import { setBitmapPixel } from './bitmapPixel';

describe('getBitmapCoverage', () => {
  it('returns 0 for a bitmap still entirely the background colour', () => {
    expect(getBitmapCoverage(createBitmap(4, 4, 0x123456ff), 0x123456ff)).toBe(0);
  });

  it('returns 0 for a fully transparent bitmap against a transparent background', () => {
    expect(getBitmapCoverage(createBitmap(4, 4, 0x00000000), 0x00000000)).toBe(0);
  });

  it('counts pixels that differ from the background on any channel', () => {
    const bitmap = createBitmap(2, 2, 0x000000ff);
    setBitmapPixel(bitmap, 0, 0, 0xff0000ff);
    expect(getBitmapCoverage(bitmap, 0x000000ff)).toBe(0.25);
  });

  it('measures a fully painted bitmap as full coverage', () => {
    const bitmap = createBitmap(2, 2, 0x000000ff);
    setBitmapPixel(bitmap, 0, 0, 0xffffffff);
    setBitmapPixel(bitmap, 1, 0, 0xffffffff);
    setBitmapPixel(bitmap, 0, 1, 0xffffffff);
    setBitmapPixel(bitmap, 1, 1, 0xffffffff);
    expect(getBitmapCoverage(bitmap, 0x000000ff)).toBe(1);
  });

  it('ignores differences within the channel tolerance', () => {
    const bitmap = createBitmap(2, 1, 0x000000ff);
    setBitmapPixel(bitmap, 0, 0, 0x050505ff); // 5 per channel
    expect(getBitmapCoverage(bitmap, 0x000000ff, 5)).toBe(0);
    expect(getBitmapCoverage(bitmap, 0x000000ff, 4)).toBe(0.5);
  });

  it('returns 0 for an empty bitmap', () => {
    expect(getBitmapCoverage(createBitmap(0, 0), 0x000000ff)).toBe(0);
  });
});
