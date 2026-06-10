import { getSurfacePixel32, setSurfacePixel32 } from './pixel';
import { createSurface } from './surface';
import { applySurfaceColorTransform, applySurfaceThreshold, mergeSurface, scrollSurface } from './transform';

const identity = {
  redMultiplier: 1,
  greenMultiplier: 1,
  blueMultiplier: 1,
  alphaMultiplier: 1,
  redOffset: 0,
  greenOffset: 0,
  blueOffset: 0,
  alphaOffset: 0,
};

describe('applySurfaceColorTransform', () => {
  it('applies multiplier', () => {
    const img = createSurface(2, 2, 0x808080ff);
    applySurfaceColorTransform(img, img, 0, 0, 2, 2, { ...identity, redMultiplier: 0 });
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0x80);
  });

  it('applies offset', () => {
    const img = createSurface(1, 1);
    setSurfacePixel32(img, 0, 0, 0x000000ff);
    applySurfaceColorTransform(img, img, 0, 0, 1, 1, { ...identity, redOffset: 100 });
    expect(img.data[0]).toBe(100);
  });

  it('clamps to 0-255', () => {
    const img = createSurface(1, 1, 0x808080ff);
    applySurfaceColorTransform(img, img, 0, 0, 1, 1, { ...identity, redMultiplier: 10, redOffset: 100 });
    expect(img.data[0]).toBe(255);
    applySurfaceColorTransform(img, img, 0, 0, 1, 1, { ...identity, redMultiplier: 0, redOffset: -100 });
    expect(img.data[0]).toBe(0);
  });

  it('only affects the specified rect', () => {
    const img = createSurface(2, 2, 0x808080ff);
    applySurfaceColorTransform(img, img, 0, 0, 1, 1, { ...identity, redMultiplier: 0 });
    expect(img.data[0]).toBe(0);
    expect(img.data[4]).toBe(0x80);
  });

  it('can write to a separate output surface', () => {
    const source = createSurface(1, 1, 0x808080ff);
    const out = createSurface(1, 1);
    applySurfaceColorTransform(out, source, 0, 0, 1, 1, { ...identity, redMultiplier: 0 });
    expect(out.data[0]).toBe(0);
    expect(out.data[1]).toBe(0x80);
    expect(source.data[0]).toBe(0x80); // source unchanged
  });
});

describe('applySurfaceThreshold', () => {
  it('replaces pixels that pass the test', () => {
    const src = createSurface(2, 1);
    setSurfacePixel32(src, 0, 0, 0x808080ff);
    setSurfacePixel32(src, 1, 0, 0x404040ff);
    const dst = createSurface(2, 1);
    const count = applySurfaceThreshold(dst, 0, 0, src, 0, 0, 2, 1, '>', 0x607060ff, 0xffffffff);
    expect(count).toBe(1);
    expect(getSurfacePixel32(dst, 0, 0)).toBe(0xffffffff);
    expect(getSurfacePixel32(dst, 1, 0)).toBe(0x00000000);
  });

  it('copies source when copySource is true and test fails', () => {
    const src = createSurface(1, 1, 0x112233ff);
    const dst = createSurface(1, 1);
    applySurfaceThreshold(dst, 0, 0, src, 0, 0, 1, 1, '>', 0xffffffff, 0xffffffff, 0xffffffff, true);
    expect(getSurfacePixel32(dst, 0, 0)).toBe(0x112233ff);
  });

  it('returns zero when no pixels pass', () => {
    const src = createSurface(2, 2, 0x000000ff);
    const dst = createSurface(2, 2);
    const count = applySurfaceThreshold(dst, 0, 0, src, 0, 0, 2, 2, '>', 0xffffffff);
    expect(count).toBe(0);
  });
});

describe('mergeSurface', () => {
  it('with mult=256 copies source', () => {
    const src = createSurface(1, 1, 0xff0000ff);
    const dst = createSurface(1, 1, 0x0000ffff);
    mergeSurface(dst, 0, 0, src, 0, 0, 1, 1, 256, 256, 256, 256);
    expect(dst.data[0]).toBe(0xff);
    expect(dst.data[2]).toBe(0x00);
  });

  it('with mult=0 keeps destination', () => {
    const src = createSurface(1, 1, 0xff0000ff);
    const dst = createSurface(1, 1, 0x0000ffff);
    mergeSurface(dst, 0, 0, src, 0, 0, 1, 1, 0, 0, 0, 0);
    expect(dst.data[0]).toBe(0x00);
    expect(dst.data[2]).toBe(0xff);
  });

  it('with mult=128 blends evenly', () => {
    const src = createSurface(1, 1, 0x200000ff);
    const dst = createSurface(1, 1, 0x000020ff);
    mergeSurface(dst, 0, 0, src, 0, 0, 1, 1, 128, 0, 128, 0);
    expect(dst.data[0]).toBeCloseTo(16, 0);
    expect(dst.data[2]).toBeCloseTo(16, 0);
  });
});

describe('scrollSurface', () => {
  it('shifts content right with wrapping', () => {
    const img = createSurface(4, 1);
    setSurfacePixel32(img, 0, 0, 0xff0000ff);
    scrollSurface(img, 1, 0);
    expect(getSurfacePixel32(img, 1, 0)).toBe(0xff0000ff);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0x00000000);
  });

  it('wraps pixels around the edge', () => {
    const img = createSurface(4, 1);
    setSurfacePixel32(img, 3, 0, 0xaabbccff);
    scrollSurface(img, 1, 0);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0xaabbccff);
  });
});
