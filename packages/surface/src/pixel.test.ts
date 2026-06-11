import { getSurfacePixel, getSurfacePixel32, setSurfacePixel, setSurfacePixel32 } from './pixel';
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
    const img = createSurface(2, 2, 0x000000ff);
    setSurfacePixel(img, 0, 0, 0xaabbcc);
    expect(img.data[3]).toBe(0xff);
  });
});

describe('getSurfacePixel32', () => {
  it('reads back an ARGB value including alpha', () => {
    const img = createSurface(2, 2);
    setSurfacePixel32(img, 0, 0, 0xaabbcc80);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0xaabbcc80);
  });
});

describe('getSurfacePixel32 / setSurfacePixel32', () => {
  it('round-trips an ARGB value', () => {
    const img = createSurface(4, 4);
    setSurfacePixel32(img, 2, 1, 0x11223380);
    expect(getSurfacePixel32(img, 2, 1)).toBe(0x11223380);
  });

  it('stores alpha in the fourth byte', () => {
    const img = createSurface(2, 2);
    setSurfacePixel32(img, 0, 0, 0x112233de);
    expect(img.data[3]).toBe(0xde);
  });
});

describe('setSurfacePixel', () => {
  it('writes RGB channels without touching alpha', () => {
    const img = createSurface(2, 2, 0x000000ff);
    setSurfacePixel(img, 0, 0, 0x112233);
    expect(img.data[3]).toBe(0xff);
    expect(getSurfacePixel(img, 0, 0)).toBe(0x112233);
  });
});

describe('setSurfacePixel32', () => {
  it('writes all four ARGB channels', () => {
    const img = createSurface(2, 2);
    setSurfacePixel32(img, 1, 0, 0xadbeefde);
    expect(getSurfacePixel32(img, 1, 0)).toBe(0xadbeefde);
  });
});
