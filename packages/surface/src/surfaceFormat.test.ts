import { convertSurfacePixelOrder, premultiplySurfacePixels, unpremultiplySurfacePixels } from './surfaceFormat';

describe('convertSurfacePixelOrder', () => {
  it('is a no-op when from === to and out !== source', () => {
    const source = new Uint8ClampedArray([0x11, 0x22, 0x33, 0xff]);
    const out = new Uint8ClampedArray(4);
    convertSurfacePixelOrder(out, source, 4, 'RGBA', 'RGBA');
    expect(out[0]).toBe(0x11);
    expect(out[1]).toBe(0x22);
  });

  it('converts RGBA to BGRA', () => {
    const source = new Uint8ClampedArray([0xaa, 0xbb, 0xcc, 0xff]);
    const out = new Uint8ClampedArray(4);
    convertSurfacePixelOrder(out, source, 4, 'RGBA', 'BGRA');
    expect(out[0]).toBe(0xcc); // B
    expect(out[1]).toBe(0xbb); // G
    expect(out[2]).toBe(0xaa); // R
    expect(out[3]).toBe(0xff); // A
  });

  it('converts RGBA to ARGB', () => {
    const source = new Uint8ClampedArray([0xaa, 0xbb, 0xcc, 0xdd]);
    const out = new Uint8ClampedArray(4);
    convertSurfacePixelOrder(out, source, 4, 'RGBA', 'ARGB');
    expect(out[0]).toBe(0xdd); // A
    expect(out[1]).toBe(0xaa); // R
    expect(out[2]).toBe(0xbb); // G
    expect(out[3]).toBe(0xcc); // B
  });

  it('round-trips RGBA → BGRA → RGBA', () => {
    const source = new Uint8ClampedArray([0x11, 0x22, 0x33, 0x44]);
    const tmp = new Uint8ClampedArray(4);
    const out = new Uint8ClampedArray(4);
    convertSurfacePixelOrder(tmp, source, 4, 'RGBA', 'BGRA');
    convertSurfacePixelOrder(out, tmp, 4, 'BGRA', 'RGBA');
    expect(out[0]).toBe(0x11);
    expect(out[1]).toBe(0x22);
    expect(out[2]).toBe(0x33);
    expect(out[3]).toBe(0x44);
  });

  it('is safe in-place for the same format (no-op path)', () => {
    const buf = new Uint8ClampedArray([0xaa, 0xbb, 0xcc, 0xff]);
    convertSurfacePixelOrder(buf, buf, 4, 'RGBA', 'RGBA');
    expect(buf[0]).toBe(0xaa);
  });

  it('is safe in-place for different formats', () => {
    const buf = new Uint8ClampedArray([0xaa, 0xbb, 0xcc, 0xff]);
    convertSurfacePixelOrder(buf, buf, 4, 'RGBA', 'BGRA');
    expect(buf[0]).toBe(0xcc);
    expect(buf[2]).toBe(0xaa);
  });
});

describe('premultiplySurfacePixels', () => {
  it('scales RGB by alpha/255', () => {
    const source = new Uint8ClampedArray([0xff, 0x80, 0x00, 0x80]);
    const out = new Uint8ClampedArray(4);
    premultiplySurfacePixels(out, source, 4);
    expect(out[0]).toBeCloseTo(0x80, 0); // 255 * 128/255 ≈ 128
    expect(out[1]).toBeCloseTo(0x40, 0); // 128 * 128/255 ≈ 64
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0x80); // alpha unchanged
  });

  it('fully transparent pixel becomes all zeros', () => {
    const source = new Uint8ClampedArray([0xff, 0xff, 0xff, 0x00]);
    const out = new Uint8ClampedArray(4);
    premultiplySurfacePixels(out, source, 4);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
  });

  it('fully opaque pixel is unchanged', () => {
    const source = new Uint8ClampedArray([0x11, 0x22, 0x33, 0xff]);
    const out = new Uint8ClampedArray(4);
    premultiplySurfacePixels(out, source, 4);
    expect(out[0]).toBe(0x11);
    expect(out[1]).toBe(0x22);
    expect(out[2]).toBe(0x33);
    expect(out[3]).toBe(0xff);
  });

  it('is safe in-place', () => {
    const buf = new Uint8ClampedArray([0xff, 0x00, 0x00, 0x80]);
    premultiplySurfacePixels(buf, buf, 4);
    expect(buf[0]).toBeCloseTo(0x80, 0);
    expect(buf[3]).toBe(0x80);
  });
});

describe('unpremultiplySurfacePixels', () => {
  it('recovers original RGB after premultiply round-trip within ±1', () => {
    // Integer premultiply introduces at most ±1 rounding error per channel.
    const source = new Uint8ClampedArray([0xc0, 0x80, 0x40, 0x80]);
    const premul = new Uint8ClampedArray(4);
    const out = new Uint8ClampedArray(4);
    premultiplySurfacePixels(premul, source, 4);
    unpremultiplySurfacePixels(out, premul, 4);
    expect(Math.abs(out[0] - 0xc0)).toBeLessThanOrEqual(1);
    expect(Math.abs(out[1] - 0x80)).toBeLessThanOrEqual(1);
    expect(out[3]).toBe(0x80);
  });

  it('fully transparent pixel remains all zeros', () => {
    const source = new Uint8ClampedArray([0x00, 0x00, 0x00, 0x00]);
    const out = new Uint8ClampedArray(4);
    unpremultiplySurfacePixels(out, source, 4);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(0);
  });

  it('is safe in-place', () => {
    const buf = new Uint8ClampedArray([0x80, 0x00, 0x00, 0x80]);
    unpremultiplySurfacePixels(buf, buf, 4);
    expect(buf[0]).toBeCloseTo(0xff, 0);
    expect(buf[3]).toBe(0x80);
  });
});
