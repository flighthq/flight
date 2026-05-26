import { describe, expect, it } from 'vitest';

import { createImageData } from './imageData';
import { getPixel, getPixel32, getPixels, setPixel, setPixel32, setPixels } from './pixel';

describe('getPixel', () => {
  it('reads back an RGB value written by setPixel', () => {
    const img = createImageData(2, 2);
    setPixel(img, 0, 0, 0xaabbcc);
    expect(getPixel(img, 0, 0)).toBe(0xaabbcc);
  });
});

describe('setPixel', () => {
  it('writes RGB channels without touching alpha', () => {
    const img = createImageData(2, 2, 0xff000000);
    setPixel(img, 0, 0, 0x112233);
    expect(img.data[3]).toBe(0xff);
    expect(getPixel(img, 0, 0)).toBe(0x112233);
  });
});

describe('getPixel32', () => {
  it('reads back an ARGB value including alpha', () => {
    const img = createImageData(2, 2);
    setPixel32(img, 0, 0, 0x80aabbcc);
    expect(getPixel32(img, 0, 0)).toBe(0x80aabbcc);
  });
});

describe('setPixel32', () => {
  it('writes all four ARGB channels', () => {
    const img = createImageData(2, 2);
    setPixel32(img, 1, 0, 0xdeadbeef);
    expect(getPixel32(img, 1, 0)).toBe(0xdeadbeef);
  });
});

describe('getPixels', () => {
  it('returns a region as a Uint8ClampedArray', () => {
    const img = createImageData(4, 4);
    setPixel32(img, 1, 1, 0xff112233);
    const region = new Uint8ClampedArray(1 * 1 * 4);
    getPixels(region, img, 1, 1, 1, 1);
    expect(region[0]).toBe(0x11);
    expect(region[1]).toBe(0x22);
    expect(region[2]).toBe(0x33);
  });
});

describe('setPixels', () => {
  it('writes a region from a Uint8ClampedArray', () => {
    const src = createImageData(2, 2, 0xff112233);
    const dst = createImageData(4, 4);
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    getPixels(pixels, src, 0, 0, 2, 2);
    setPixels(dst, 1, 1, 2, 2, pixels);
    expect(getPixel32(dst, 1, 1)).toBe(0xff112233);
  });
});

describe('getPixel / setPixel', () => {
  it('round-trips an RGB value', () => {
    const img = createImageData(4, 4);
    setPixel(img, 1, 2, 0x112233);
    expect(getPixel(img, 1, 2)).toBe(0x112233);
  });

  it('does not touch alpha', () => {
    const img = createImageData(2, 2, 0xff000000);
    setPixel(img, 0, 0, 0xaabbcc);
    expect(img.data[3]).toBe(0xff);
  });
});

describe('getPixel32 / setPixel32', () => {
  it('round-trips an ARGB value', () => {
    const img = createImageData(4, 4);
    setPixel32(img, 2, 1, 0x80112233);
    expect(getPixel32(img, 2, 1)).toBe(0x80112233);
  });

  it('stores alpha in the fourth byte', () => {
    const img = createImageData(2, 2);
    setPixel32(img, 0, 0, 0xde112233);
    expect(img.data[3]).toBe(0xde);
  });
});

describe('getPixels / setPixels', () => {
  it('round-trips a region', () => {
    const img = createImageData(4, 4);
    setPixel32(img, 1, 1, 0xff112233);
    setPixel32(img, 2, 1, 0xff445566);
    const region = new Uint8ClampedArray(2 * 1 * 4);
    getPixels(region, img, 1, 1, 2, 1);
    expect(region[0]).toBe(0x11);
    expect(region[4]).toBe(0x44);
  });

  it('restores a region written with setPixels', () => {
    const src = createImageData(2, 2, 0xffaabbcc);
    const dst = createImageData(4, 4);
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    getPixels(pixels, src, 0, 0, 2, 2);
    setPixels(dst, 1, 1, 2, 2, pixels);
    expect(getPixel32(dst, 1, 1)).toBe(0xffaabbcc);
    expect(getPixel32(dst, 2, 2)).toBe(0xffaabbcc);
  });
});
