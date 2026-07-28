import { createBitmap } from './bitmap';
import { ImageChannel } from './bitmapImageChannel';
import {
  getBitmapPixel,
  getBitmapPixelChannel,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  setBitmapPixel,
  setBitmapPixelRgb,
} from './bitmapPixel';

describe('getBitmapPixel', () => {
  it('reads back a full 0xRRGGBBAA value written by setBitmapPixel', () => {
    const img = createBitmap(2, 2);
    setBitmapPixel(img, 0, 0, 0xaabbcc80);
    expect(getBitmapPixel(img, 0, 0)).toBe(0xaabbcc80);
  });

  it('reads the first pixel at (0, 0)', () => {
    const img = createBitmap(8, 8);
    setBitmapPixel(img, 0, 0, 0xdeadbeef);
    expect(getBitmapPixel(img, 0, 0)).toBe(0xdeadbeef);
  });

  it('reads the last pixel at (width-1, height-1)', () => {
    const img = createBitmap(8, 8);
    setBitmapPixel(img, 7, 7, 0xcafebabe);
    expect(getBitmapPixel(img, 7, 7)).toBe(0xcafebabe);
  });

  it('round-trips an RGBA value', () => {
    const img = createBitmap(4, 4);
    setBitmapPixel(img, 1, 2, 0x11223380);
    expect(getBitmapPixel(img, 1, 2)).toBe(0x11223380);
  });

  it('stores alpha in the fourth byte', () => {
    const img = createBitmap(2, 2);
    setBitmapPixel(img, 0, 0, 0x112233de);
    expect(img.data[3]).toBe(0xde);
  });
});

describe('getBitmapPixelChannel', () => {
  it('reads a single channel by index', () => {
    const img = createBitmap(2, 2);
    setBitmapPixel(img, 0, 0, 0xaabbccdd);
    expect(getBitmapPixelChannel(img, 0, 0, ImageChannel.Red)).toBe(0xaa);
    expect(getBitmapPixelChannel(img, 0, 0, ImageChannel.Green)).toBe(0xbb);
    expect(getBitmapPixelChannel(img, 0, 0, ImageChannel.Blue)).toBe(0xcc);
    expect(getBitmapPixelChannel(img, 0, 0, ImageChannel.Alpha)).toBe(0xdd);
  });
});

describe('getBitmapPixelLuminance', () => {
  it('returns 0 for black', () => {
    const img = createBitmap(1, 1, 0x000000ff);
    expect(getBitmapPixelLuminance(img, 0, 0)).toBe(0);
  });

  it('returns 255 for white', () => {
    const img = createBitmap(1, 1, 0xffffffff);
    expect(getBitmapPixelLuminance(img, 0, 0)).toBe(255);
  });

  it('uses W3C luma weighting (green is heaviest)', () => {
    const red = createBitmap(1, 1, 0xff0000ff);
    const green = createBitmap(1, 1, 0x00ff00ff);
    const blue = createBitmap(1, 1, 0x0000ffff);
    expect(getBitmapPixelLuminance(green, 0, 0)).toBeGreaterThan(getBitmapPixelLuminance(red, 0, 0));
    expect(getBitmapPixelLuminance(red, 0, 0)).toBeGreaterThan(getBitmapPixelLuminance(blue, 0, 0));
  });
});

describe('getBitmapPixelRgb', () => {
  it('reads back a 0xRRGGBB value without alpha', () => {
    const img = createBitmap(2, 2);
    setBitmapPixelRgb(img, 0, 0, 0xaabbcc);
    expect(getBitmapPixelRgb(img, 0, 0)).toBe(0xaabbcc);
  });

  it('round-trips an RGB value', () => {
    const img = createBitmap(4, 4);
    setBitmapPixelRgb(img, 1, 2, 0x112233);
    expect(getBitmapPixelRgb(img, 1, 2)).toBe(0x112233);
  });
});

describe('setBitmapPixel', () => {
  it('writes all four RGBA channels', () => {
    const img = createBitmap(2, 2);
    setBitmapPixel(img, 1, 0, 0xadbeefde);
    expect(getBitmapPixel(img, 1, 0)).toBe(0xadbeefde);
  });

  it('writes to the last pixel at (width-1, height-1)', () => {
    const img = createBitmap(8, 8);
    setBitmapPixel(img, 7, 7, 0xfedcba98);
    expect(getBitmapPixel(img, 7, 7)).toBe(0xfedcba98);
  });

  it('bumps the bitmap version (self-invalidation)', () => {
    const img = createBitmap(2, 2);
    const before = img.version;
    setBitmapPixel(img, 1, 0, 0xadbeefde);
    expect(img.version).toBe(before + 1);
  });
});

describe('setBitmapPixelRgb', () => {
  it('writes RGB channels without touching alpha', () => {
    const img = createBitmap(2, 2, 0x000000ff);
    setBitmapPixelRgb(img, 0, 0, 0x112233);
    expect(img.data[3]).toBe(0xff);
    expect(getBitmapPixelRgb(img, 0, 0)).toBe(0x112233);
  });
});
