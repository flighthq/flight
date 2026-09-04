import { cloneBitmap, convertBitmapAlphaType, createBitmap, initializeBitmap, invalidateBitmap } from './bitmap';

describe('cloneBitmap', () => {
  it('produces identical values', () => {
    const img = createBitmap(2, 2, 0x102030ff);
    const clone = cloneBitmap(img);
    expect(clone.width).toBe(img.width);
    expect(clone.height).toBe(img.height);
    expect(clone.data).toEqual(img.data);
  });

  it('is a deep copy', () => {
    const img = createBitmap(2, 2, 0x102030ff);
    const clone = cloneBitmap(img);
    clone.data[0] = 0;
    expect(img.data[0]).toBe(0x10);
  });
});

describe('convertBitmapAlphaType', () => {
  it('premultiplies straight alpha', () => {
    const img = createBitmap(1, 1, 0x80808080);
    img.alphaType = 'straight';
    convertBitmapAlphaType(img, 'premultiplied');
    expect(img.alphaType).toBe('premultiplied');
    // R = round(0x80 * (0x80/255)) ≈ round(128 * 0.502) ≈ 64
    expect(img.data[0]).toBe(64);
    expect(img.data[3]).toBe(0x80); // alpha unchanged
  });

  it('unpremultiplies premultiplied alpha', () => {
    // Pre-build a premultiplied bitmap manually.
    const img = createBitmap(1, 1, 0x00000000);
    img.alphaType = 'premultiplied';
    img.data[0] = 64;
    img.data[1] = 64;
    img.data[2] = 64;
    img.data[3] = 128;
    convertBitmapAlphaType(img, 'straight');
    expect(img.alphaType).toBe('straight');
    // R = round(64 * 255/128) = round(127.5) = 128
    expect(img.data[0]).toBe(128);
  });

  it('is a no-op when target matches current alphaType', () => {
    const img = createBitmap(1, 1, 0xff0000ff);
    img.alphaType = 'straight';
    const before = Array.from(img.data);
    convertBitmapAlphaType(img, 'straight');
    expect(Array.from(img.data)).toEqual(before);
  });

  it('handles zero-alpha pixels (unpremultiply)', () => {
    const img = createBitmap(1, 1, 0x00000000);
    img.alphaType = 'premultiplied';
    convertBitmapAlphaType(img, 'straight');
    expect(img.data[0]).toBe(0);
    expect(img.data[3]).toBe(0);
  });
});

describe('createBitmap', () => {
  it('creates zeroed image data when no color provided', () => {
    const img = createBitmap(2, 2);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.data.length).toBe(16);
    expect(img.data.every((v) => v === 0)).toBe(true);
  });

  it('fills with the given color', () => {
    const img = createBitmap(2, 2, 0x112233ff);
    expect(img.data[0]).toBe(0x11);
    expect(img.data[1]).toBe(0x22);
    expect(img.data[2]).toBe(0x33);
    expect(img.data[3]).toBe(0xff);
  });
});

describe('initializeBitmap', () => {
  it('is the construction initializer of createBitmap', () => {
    expect(typeof initializeBitmap).toBe('function');
  });
});
describe('invalidateBitmap', () => {
  it('bumps the content version without replacing the pixel storage', () => {
    const bitmap = createBitmap(1, 1);
    const data = bitmap.data;
    invalidateBitmap(bitmap);
    expect(bitmap.version).toBe(1);
    expect(bitmap.data).toBe(data);
  });
});
