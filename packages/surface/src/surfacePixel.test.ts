import { createSurface } from './surface';
import { ImageChannel } from './surfaceImageChannel';
import {
  getSurfacePixel,
  getSurfacePixelChannel,
  getSurfacePixelLuminance,
  getSurfacePixelRgb,
  setSurfacePixel,
  setSurfacePixelRgb,
} from './surfacePixel';

describe('getSurfacePixel', () => {
  it('reads back a full 0xRRGGBBAA value written by setSurfacePixel', () => {
    const img = createSurface(2, 2);
    setSurfacePixel(img, 0, 0, 0xaabbcc80);
    expect(getSurfacePixel(img, 0, 0)).toBe(0xaabbcc80);
  });

  it('round-trips an RGBA value', () => {
    const img = createSurface(4, 4);
    setSurfacePixel(img, 1, 2, 0x11223380);
    expect(getSurfacePixel(img, 1, 2)).toBe(0x11223380);
  });

  it('stores alpha in the fourth byte', () => {
    const img = createSurface(2, 2);
    setSurfacePixel(img, 0, 0, 0x112233de);
    expect(img.data[3]).toBe(0xde);
  });
});

describe('getSurfacePixelChannel', () => {
  it('reads a single channel by index', () => {
    const img = createSurface(2, 2);
    setSurfacePixel(img, 0, 0, 0xaabbccdd);
    expect(getSurfacePixelChannel(img, 0, 0, ImageChannel.Red)).toBe(0xaa);
    expect(getSurfacePixelChannel(img, 0, 0, ImageChannel.Green)).toBe(0xbb);
    expect(getSurfacePixelChannel(img, 0, 0, ImageChannel.Blue)).toBe(0xcc);
    expect(getSurfacePixelChannel(img, 0, 0, ImageChannel.Alpha)).toBe(0xdd);
  });
});

describe('getSurfacePixelLuminance', () => {
  it('returns 0 for black', () => {
    const img = createSurface(1, 1, 0x000000ff);
    expect(getSurfacePixelLuminance(img, 0, 0)).toBe(0);
  });

  it('returns 255 for white', () => {
    const img = createSurface(1, 1, 0xffffffff);
    expect(getSurfacePixelLuminance(img, 0, 0)).toBe(255);
  });

  it('uses W3C luma weighting (green is heaviest)', () => {
    const red = createSurface(1, 1, 0xff0000ff);
    const green = createSurface(1, 1, 0x00ff00ff);
    const blue = createSurface(1, 1, 0x0000ffff);
    expect(getSurfacePixelLuminance(green, 0, 0)).toBeGreaterThan(getSurfacePixelLuminance(red, 0, 0));
    expect(getSurfacePixelLuminance(red, 0, 0)).toBeGreaterThan(getSurfacePixelLuminance(blue, 0, 0));
  });
});

describe('getSurfacePixelRgb', () => {
  it('reads back a 0xRRGGBB value without alpha', () => {
    const img = createSurface(2, 2);
    setSurfacePixelRgb(img, 0, 0, 0xaabbcc);
    expect(getSurfacePixelRgb(img, 0, 0)).toBe(0xaabbcc);
  });

  it('round-trips an RGB value', () => {
    const img = createSurface(4, 4);
    setSurfacePixelRgb(img, 1, 2, 0x112233);
    expect(getSurfacePixelRgb(img, 1, 2)).toBe(0x112233);
  });
});

describe('setSurfacePixel', () => {
  it('writes all four RGBA channels', () => {
    const img = createSurface(2, 2);
    setSurfacePixel(img, 1, 0, 0xadbeefde);
    expect(getSurfacePixel(img, 1, 0)).toBe(0xadbeefde);
  });

  it('bumps the surface version (self-invalidation)', () => {
    const img = createSurface(2, 2);
    const before = img.version;
    setSurfacePixel(img, 1, 0, 0xadbeefde);
    expect(img.version).toBe(before + 1);
  });
});

describe('setSurfacePixelRgb', () => {
  it('writes RGB channels without touching alpha', () => {
    const img = createSurface(2, 2, 0x000000ff);
    setSurfacePixelRgb(img, 0, 0, 0x112233);
    expect(img.data[3]).toBe(0xff);
    expect(getSurfacePixelRgb(img, 0, 0)).toBe(0x112233);
  });
});
