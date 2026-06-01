import { describe, expect, it } from 'vitest';

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
    const img = createSurface(2, 2, 0xff808080);
    applySurfaceColorTransform(img, 0, 0, 2, 2, { ...identity, redMultiplier: 0 });
    expect(img.data[0]).toBe(0);
    expect(img.data[1]).toBe(0x80);
  });

  it('applies offset', () => {
    const img = createSurface(1, 1);
    setSurfacePixel32(img, 0, 0, 0xff000000);
    applySurfaceColorTransform(img, 0, 0, 1, 1, { ...identity, redOffset: 100 });
    expect(img.data[0]).toBe(100);
  });

  it('clamps to 0-255', () => {
    const img = createSurface(1, 1, 0xff808080);
    applySurfaceColorTransform(img, 0, 0, 1, 1, { ...identity, redMultiplier: 10, redOffset: 100 });
    expect(img.data[0]).toBe(255);
    applySurfaceColorTransform(img, 0, 0, 1, 1, { ...identity, redMultiplier: 0, redOffset: -100 });
    expect(img.data[0]).toBe(0);
  });

  it('only affects the specified rect', () => {
    const img = createSurface(2, 2, 0xff808080);
    applySurfaceColorTransform(img, 0, 0, 1, 1, { ...identity, redMultiplier: 0 });
    expect(img.data[0]).toBe(0);
    expect(img.data[4]).toBe(0x80);
  });
});

describe('applySurfaceThreshold', () => {
  it('replaces pixels that pass the test', () => {
    const src = createSurface(2, 1);
    setSurfacePixel32(src, 0, 0, 0xff808080);
    setSurfacePixel32(src, 1, 0, 0xff404040);
    const dst = createSurface(2, 1);
    const count = applySurfaceThreshold(src, 0, 0, 2, 1, dst, 0, 0, '>', 0xff607060, 0xffffffff);
    expect(count).toBe(1);
    expect(getSurfacePixel32(dst, 0, 0)).toBe(0xffffffff);
    expect(getSurfacePixel32(dst, 1, 0)).toBe(0x00000000);
  });

  it('copies source when copySource is true and test fails', () => {
    const src = createSurface(1, 1, 0xff112233);
    const dst = createSurface(1, 1);
    applySurfaceThreshold(src, 0, 0, 1, 1, dst, 0, 0, '>', 0xffffffff, 0xffffffff, 0xffffffff, true);
    expect(getSurfacePixel32(dst, 0, 0)).toBe(0xff112233);
  });

  it('returns zero when no pixels pass', () => {
    const src = createSurface(2, 2, 0xff000000);
    const dst = createSurface(2, 2);
    const count = applySurfaceThreshold(src, 0, 0, 2, 2, dst, 0, 0, '>', 0xffffffff);
    expect(count).toBe(0);
  });
});

describe('mergeSurface', () => {
  it('with mult=256 copies source', () => {
    const src = createSurface(1, 1, 0xffff0000);
    const dst = createSurface(1, 1, 0xff0000ff);
    mergeSurface(src, 0, 0, 1, 1, dst, 0, 0, 256, 256, 256, 256);
    expect(dst.data[0]).toBe(0xff);
    expect(dst.data[2]).toBe(0x00);
  });

  it('with mult=0 keeps destination', () => {
    const src = createSurface(1, 1, 0xffff0000);
    const dst = createSurface(1, 1, 0xff0000ff);
    mergeSurface(src, 0, 0, 1, 1, dst, 0, 0, 0, 0, 0, 0);
    expect(dst.data[0]).toBe(0x00);
    expect(dst.data[2]).toBe(0xff);
  });

  it('with mult=128 blends evenly', () => {
    const src = createSurface(1, 1, 0xff200000);
    const dst = createSurface(1, 1, 0xff000020);
    mergeSurface(src, 0, 0, 1, 1, dst, 0, 0, 128, 0, 128, 0);
    expect(dst.data[0]).toBeCloseTo(16, 0);
    expect(dst.data[2]).toBeCloseTo(16, 0);
  });
});

describe('scrollSurface', () => {
  it('shifts content right with wrapping', () => {
    const img = createSurface(4, 1);
    setSurfacePixel32(img, 0, 0, 0xffff0000);
    scrollSurface(img, 1, 0);
    expect(getSurfacePixel32(img, 1, 0)).toBe(0xffff0000);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0x00000000);
  });

  it('wraps pixels around the edge', () => {
    const img = createSurface(4, 1);
    setSurfacePixel32(img, 3, 0, 0xffaabbcc);
    scrollSurface(img, 1, 0);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0xffaabbcc);
  });
});
