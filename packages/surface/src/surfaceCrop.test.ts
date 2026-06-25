import { createSurface } from './surface';
import { cropSurface, extendSurface, trimSurface } from './surfaceCrop';
import { getSurfacePixel, setSurfacePixel } from './surfacePixel';

describe('cropSurface', () => {
  it('returns a surface with the requested dimensions', () => {
    const src = createSurface(10, 10, 0xff0000ff);
    const out = cropSurface(src, { x: 2, y: 3, width: 4, height: 5 });
    expect(out.width).toBe(4);
    expect(out.height).toBe(5);
  });

  it('copies pixels from the source region', () => {
    const src = createSurface(4, 4);
    setSurfacePixel(src, 2, 1, 0x00ff00ff);
    const out = cropSurface(src, { x: 2, y: 1, width: 2, height: 2 });
    expect(getSurfacePixel(out, 0, 0)).toBe(0x00ff00ff);
  });

  it('fills pixels outside the source with transparent black', () => {
    const src = createSurface(2, 2, 0xffffffff);
    // Crop region extends beyond source.
    const out = cropSurface(src, { x: 1, y: 1, width: 3, height: 3 });
    // (0,0) is inside source — opaque white.
    expect(getSurfacePixel(out, 0, 0)).toBe(0xffffffff);
    // (2,2) is outside source — transparent black.
    expect(getSurfacePixel(out, 2, 2)).toBe(0x00000000);
  });

  it('preserves source colorSpace and alphaType', () => {
    const src = createSurface(2, 2, 0xff0000ff);
    const out = cropSurface(src, { x: 0, y: 0, width: 2, height: 2 });
    expect(out.colorSpace).toBe(src.colorSpace);
    expect(out.alphaType).toBe(src.alphaType);
  });

  it('returns a distinct surface object', () => {
    const src = createSurface(2, 2, 0xff0000ff);
    const out = cropSurface(src, { x: 0, y: 0, width: 2, height: 2 });
    expect(out).not.toBe(src);
    expect(out.data).not.toBe(src.data);
  });
});

describe('extendSurface', () => {
  it('returns a surface padded by the correct number of pixels', () => {
    const src = createSurface(2, 2, 0x0000ffff);
    const out = extendSurface(src, 1, 2, 3, 4);
    expect(out.width).toBe(2 + 1 + 3);
    expect(out.height).toBe(2 + 2 + 4);
  });

  it('copies source pixels into the center region', () => {
    const src = createSurface(2, 2, 0xabcdefff);
    const out = extendSurface(src, 1, 1, 1, 1);
    expect(getSurfacePixel(out, 1, 1)).toBe(0xabcdefff);
  });

  it('transparent edge mode fills padding with transparent black by default', () => {
    const src = createSurface(2, 2, 0xff0000ff);
    const out = extendSurface(src, 1, 1, 1, 1);
    expect(getSurfacePixel(out, 0, 0)).toBe(0x00000000);
  });

  it('transparent edge mode uses fillColor when provided', () => {
    const src = createSurface(2, 2, 0xff0000ff);
    const out = extendSurface(src, 1, 1, 1, 1, 'transparent', 0xffffffff);
    expect(getSurfacePixel(out, 0, 0)).toBe(0xffffffff);
  });

  it('clamp edge mode repeats border pixels in padding', () => {
    const src = createSurface(2, 2, 0x0000ffff);
    // Set a distinct border pixel.
    setSurfacePixel(src, 0, 0, 0x123456ff);
    const out = extendSurface(src, 1, 1, 0, 0, 'clamp');
    // Top-left padding comes from source (0,0).
    expect(getSurfacePixel(out, 0, 0)).toBe(0x123456ff);
  });

  it('wrap edge mode tiles the source in padding', () => {
    const src = createSurface(2, 2);
    setSurfacePixel(src, 0, 0, 0xff0000ff);
    setSurfacePixel(src, 1, 0, 0x00ff00ff);
    // Extend by 2 on the right → first padding column maps to source col 0.
    const out = extendSurface(src, 0, 0, 2, 0, 'wrap');
    expect(getSurfacePixel(out, 2, 0)).toBe(0xff0000ff);
    expect(getSurfacePixel(out, 3, 0)).toBe(0x00ff00ff);
  });
});

describe('trimSurface', () => {
  it('removes transparent border rows and columns', () => {
    const src = createSurface(5, 5);
    // Only pixel (2,2) is non-transparent.
    setSurfacePixel(src, 2, 2, 0xff0000ff);
    const out = trimSurface(src);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(getSurfacePixel(out, 0, 0)).toBe(0xff0000ff);
  });

  it('returns a 1×1 transparent surface for a fully transparent input', () => {
    const src = createSurface(3, 3);
    const out = trimSurface(src);
    expect(out.width).toBe(1);
    expect(out.height).toBe(1);
    expect(getSurfacePixel(out, 0, 0) & 0xff).toBe(0);
  });

  it('returns a surface equal to the source when there is no transparent border', () => {
    const src = createSurface(2, 2, 0xff0000ff);
    const out = trimSurface(src);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
  });
});
