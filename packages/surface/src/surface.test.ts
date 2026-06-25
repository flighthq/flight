import { cloneSurface, convertSurfaceAlphaType, createSurface } from './surface';

describe('cloneSurface', () => {
  it('produces identical values', () => {
    const img = createSurface(2, 2, 0x102030ff);
    const clone = cloneSurface(img);
    expect(clone.width).toBe(img.width);
    expect(clone.height).toBe(img.height);
    expect(clone.data).toEqual(img.data);
  });

  it('is a deep copy', () => {
    const img = createSurface(2, 2, 0x102030ff);
    const clone = cloneSurface(img);
    clone.data[0] = 0;
    expect(img.data[0]).toBe(0x10);
  });
});

describe('convertSurfaceAlphaType', () => {
  it('premultiplies straight alpha', () => {
    const img = createSurface(1, 1, 0x80808080);
    img.alphaType = 'straight';
    convertSurfaceAlphaType(img, 'premultiplied');
    expect(img.alphaType).toBe('premultiplied');
    // R = round(0x80 * (0x80/255)) ≈ round(128 * 0.502) ≈ 64
    expect(img.data[0]).toBe(64);
    expect(img.data[3]).toBe(0x80); // alpha unchanged
  });

  it('unpremultiplies premultiplied alpha', () => {
    // Pre-build a premultiplied surface manually.
    const img = createSurface(1, 1, 0x00000000);
    img.alphaType = 'premultiplied';
    img.data[0] = 64;
    img.data[1] = 64;
    img.data[2] = 64;
    img.data[3] = 128;
    convertSurfaceAlphaType(img, 'straight');
    expect(img.alphaType).toBe('straight');
    // R = round(64 * 255/128) = round(127.5) = 128
    expect(img.data[0]).toBe(128);
  });

  it('is a no-op when target matches current alphaType', () => {
    const img = createSurface(1, 1, 0xff0000ff);
    img.alphaType = 'straight';
    const before = Array.from(img.data);
    convertSurfaceAlphaType(img, 'straight');
    expect(Array.from(img.data)).toEqual(before);
  });

  it('handles zero-alpha pixels (unpremultiply)', () => {
    const img = createSurface(1, 1, 0x00000000);
    img.alphaType = 'premultiplied';
    convertSurfaceAlphaType(img, 'straight');
    expect(img.data[0]).toBe(0);
    expect(img.data[3]).toBe(0);
  });
});

describe('createSurface', () => {
  it('creates zeroed image data when no color provided', () => {
    const img = createSurface(2, 2);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(16);
    expect(img.data.every((v) => v === 0)).toBe(true);
  });

  it('fills with the given color', () => {
    const img = createSurface(2, 2, 0x112233ff);
    expect(img.data[0]).toBe(0x11);
    expect(img.data[1]).toBe(0x22);
    expect(img.data[2]).toBe(0x33);
    expect(img.data[3]).toBe(0xff);
  });
});
