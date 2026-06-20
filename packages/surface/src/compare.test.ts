import type { Surface } from '@flighthq/types';

import { compareSurface, getSurfaceMismatch } from './compare';
import { setSurfacePixel } from './pixel';
import { cloneSurface, createSurface } from './surface';

describe('compareSurface', () => {
  it('throws when widths differ', () => {
    const a = createSurface(4, 4);
    const b = createSurface(8, 4);
    expect(() => compareSurface(a, b)).toThrow();
  });

  it('throws when heights differ', () => {
    const a = createSurface(4, 4);
    const b = createSurface(4, 8);
    expect(() => compareSurface(a, b)).toThrow();
  });

  it('returns null for identical images', () => {
    const a = createSurface(4, 4, 0x0000ffff);
    const b = cloneSurface(a);
    expect(compareSurface(a, b)).toBeNull();
  });

  it('returns diff Surface for different pixels', () => {
    const a = createSurface(2, 1, 0x000000ff);
    const b = createSurface(2, 1, 0x000000ff);
    setSurfacePixel(b, 0, 0, 0x102030ff);
    const result = compareSurface(a, b) as Surface;
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    expect(result.data[0]).toBe(0x10);
    expect(result.data[1]).toBe(0x20);
    expect(result.data[2]).toBe(0x30);
    expect(result.data[3]).toBe(255);
    expect(result.data[4]).toBe(0);
    expect(result.data[5]).toBe(0);
    expect(result.data[6]).toBe(0);
    expect(result.data[7]).toBe(0);
  });

  it('diff pixel alpha is 255 when any channel differs', () => {
    const a = createSurface(1, 1, 0x000000ff);
    const b = createSurface(1, 1, 0x00000080);
    const result = compareSurface(a, b) as Surface;
    expect(result.data[3]).toBe(255);
  });

  it('unchanged pixels in diff have zero alpha', () => {
    const a = createSurface(2, 1, 0x000000ff);
    const b = cloneSurface(a);
    setSurfacePixel(b, 1, 0, 0xff0000ff);
    const result = compareSurface(a, b) as Surface;
    expect(result.data[3]).toBe(0);
    expect(result.data[7]).toBe(255);
  });
});

describe('getSurfaceMismatch', () => {
  it('throws when dimensions differ', () => {
    expect(() => getSurfaceMismatch(createSurface(4, 4), createSurface(4, 8))).toThrow();
  });

  it('reports zero mismatch for identical surfaces', () => {
    const a = createSurface(4, 4, 0x0000ffff);
    const result = getSurfaceMismatch(a, cloneSurface(a));
    expect(result.mismatchedPixels).toBe(0);
    expect(result.totalPixels).toBe(16);
    expect(result.fraction).toBe(0);
    expect(result.maxChannelDelta).toBe(0);
  });

  it('counts pixels whose max channel delta exceeds the tolerance', () => {
    const a = createSurface(2, 1, 0x000000ff);
    const b = createSurface(2, 1, 0x000000ff);
    setSurfacePixel(b, 0, 0, 0x0a0000ff); // delta 10 on one channel
    expect(getSurfaceMismatch(a, b, 0).mismatchedPixels).toBe(1);
    expect(getSurfaceMismatch(a, b, 9).mismatchedPixels).toBe(1);
    expect(getSurfaceMismatch(a, b, 10).mismatchedPixels).toBe(0); // within tolerance
  });

  it('reports the largest channel delta and the mismatch fraction', () => {
    const a = createSurface(2, 1, 0x000000ff);
    const b = createSurface(2, 1, 0x000000ff);
    setSurfacePixel(b, 1, 0, 0x804020ff); // max delta 0x80 = 128
    const result = getSurfaceMismatch(a, b);
    expect(result.maxChannelDelta).toBe(128);
    expect(result.mismatchedPixels).toBe(1);
    expect(result.fraction).toBe(0.5);
  });
});
