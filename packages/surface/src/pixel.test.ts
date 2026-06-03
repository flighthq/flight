import {
  getSurfacePixel,
  getSurfacePixel32,
  getSurfacePixels,
  setSurfacePixel,
  setSurfacePixel32,
  setSurfacePixels,
} from './pixel';
import { createSurface } from './surface';

describe('getSurfacePixel', () => {
  it('reads back an RGB value written by setSurfacePixel', () => {
    const img = createSurface(2, 2);
    setSurfacePixel(img, 0, 0, 0xaabbcc);
    expect(getSurfacePixel(img, 0, 0)).toBe(0xaabbcc);
  });
});

describe('getSurfacePixel / setSurfacePixel', () => {
  it('round-trips an RGB value', () => {
    const img = createSurface(4, 4);
    setSurfacePixel(img, 1, 2, 0x112233);
    expect(getSurfacePixel(img, 1, 2)).toBe(0x112233);
  });

  it('does not touch alpha', () => {
    const img = createSurface(2, 2, 0xff000000);
    setSurfacePixel(img, 0, 0, 0xaabbcc);
    expect(img.data[3]).toBe(0xff);
  });
});

describe('getSurfacePixel32', () => {
  it('reads back an ARGB value including alpha', () => {
    const img = createSurface(2, 2);
    setSurfacePixel32(img, 0, 0, 0x80aabbcc);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0x80aabbcc);
  });
});

describe('getSurfacePixel32 / setSurfacePixel32', () => {
  it('round-trips an ARGB value', () => {
    const img = createSurface(4, 4);
    setSurfacePixel32(img, 2, 1, 0x80112233);
    expect(getSurfacePixel32(img, 2, 1)).toBe(0x80112233);
  });

  it('stores alpha in the fourth byte', () => {
    const img = createSurface(2, 2);
    setSurfacePixel32(img, 0, 0, 0xde112233);
    expect(img.data[3]).toBe(0xde);
  });
});

describe('getSurfacePixels', () => {
  it('returns a region as a Uint8ClampedArray', () => {
    const img = createSurface(4, 4);
    setSurfacePixel32(img, 1, 1, 0xff112233);
    const region = new Uint8ClampedArray(1 * 1 * 4);
    getSurfacePixels(region, img, 1, 1, 1, 1);
    expect(region[0]).toBe(0x11);
    expect(region[1]).toBe(0x22);
    expect(region[2]).toBe(0x33);
  });
});

describe('getSurfacePixels / setSurfacePixels', () => {
  it('round-trips a region', () => {
    const img = createSurface(4, 4);
    setSurfacePixel32(img, 1, 1, 0xff112233);
    setSurfacePixel32(img, 2, 1, 0xff445566);
    const region = new Uint8ClampedArray(2 * 1 * 4);
    getSurfacePixels(region, img, 1, 1, 2, 1);
    expect(region[0]).toBe(0x11);
    expect(region[4]).toBe(0x44);
  });

  it('restores a region written with setSurfacePixels', () => {
    const src = createSurface(2, 2, 0xffaabbcc);
    const dst = createSurface(4, 4);
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    getSurfacePixels(pixels, src, 0, 0, 2, 2);
    setSurfacePixels(dst, 1, 1, 2, 2, pixels);
    expect(getSurfacePixel32(dst, 1, 1)).toBe(0xffaabbcc);
    expect(getSurfacePixel32(dst, 2, 2)).toBe(0xffaabbcc);
  });
});

describe('setSurfacePixel', () => {
  it('writes RGB channels without touching alpha', () => {
    const img = createSurface(2, 2, 0xff000000);
    setSurfacePixel(img, 0, 0, 0x112233);
    expect(img.data[3]).toBe(0xff);
    expect(getSurfacePixel(img, 0, 0)).toBe(0x112233);
  });
});

describe('setSurfacePixel32', () => {
  it('writes all four ARGB channels', () => {
    const img = createSurface(2, 2);
    setSurfacePixel32(img, 1, 0, 0xdeadbeef);
    expect(getSurfacePixel32(img, 1, 0)).toBe(0xdeadbeef);
  });
});

describe('setSurfacePixels', () => {
  it('writes a region from a Uint8ClampedArray', () => {
    const src = createSurface(2, 2, 0xff112233);
    const dst = createSurface(4, 4);
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    getSurfacePixels(pixels, src, 0, 0, 2, 2);
    setSurfacePixels(dst, 1, 1, 2, 2, pixels);
    expect(getSurfacePixel32(dst, 1, 1)).toBe(0xff112233);
  });
});
