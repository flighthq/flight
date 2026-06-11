import { dissolveSurfacePixels } from './dissolve';
import { getSurfacePixel32, setSurfacePixel32 } from './pixel';
import { createSurfaceRegion } from './region';
import { createSurface } from './surface';

function countChangedPixels(data: Readonly<Uint8ClampedArray>, original: Readonly<Uint8ClampedArray>): number {
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] !== original[i] ||
      data[i + 1] !== original[i + 1] ||
      data[i + 2] !== original[i + 2] ||
      data[i + 3] !== original[i + 3]
    ) {
      changed++;
    }
  }
  return changed;
}

describe('dissolveSurfacePixels', () => {
  it('dissolves at most pixelCount pixels per call', () => {
    const source = createSurface(4, 4, 0x112233ff);
    const dest = createSurface(4, 4, 0x00000000);
    const original = dest.data.slice();
    dissolveSurfacePixels(createSurfaceRegion(dest), createSurfaceRegion(source), 0, 5);
    expect(countChangedPixels(dest.data, original)).toBe(5);
  });

  it('eventually covers every pixel exactly once so dest matches source', () => {
    const source = createSurface(5, 3);
    for (let i = 0; i < 5 * 3; i++) setSurfacePixel32(source, i % 5, (i / 5) | 0, (0x01010100 * (i + 1)) >>> 0);
    const dest = createSurface(5, 3, 0x00000000);
    const sourceRegion = createSurfaceRegion(source);
    const destRegion = createSurfaceRegion(dest);

    let seed = 0;
    for (let call = 0; call < 8; call++) seed = dissolveSurfacePixels(destRegion, sourceRegion, seed, 2);

    expect(Array.from(dest.data)).toEqual(Array.from(source.data));
  });

  it('is deterministic for the same seed sequence', () => {
    const source = createSurface(6, 6, 0xaabbccff);
    const a = createSurface(6, 6, 0x00000000);
    const b = createSurface(6, 6, 0x00000000);
    const sourceRegion = createSurfaceRegion(source);
    dissolveSurfacePixels(createSurfaceRegion(a), sourceRegion, 3, 7);
    dissolveSurfacePixels(createSurfaceRegion(b), sourceRegion, 3, 7);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('returns a terminal seed once fully dissolved that no-ops on reuse', () => {
    const source = createSurface(4, 4, 0x445566ff);
    const dest = createSurface(4, 4, 0x00000000);
    const sourceRegion = createSurfaceRegion(source);
    const destRegion = createSurfaceRegion(dest);

    let seed = 0;
    for (let call = 0; call < 16; call++) seed = dissolveSurfacePixels(destRegion, sourceRegion, seed, 1);
    expect(Array.from(dest.data)).toEqual(Array.from(source.data));

    const afterComplete = dissolveSurfacePixels(destRegion, sourceRegion, seed, 4);
    expect(afterComplete).toBe(seed);
  });

  it('dissolves toward fillColor when source and dest are the same region', () => {
    const surface = createSurface(3, 3, 0x112233ff);
    const region = createSurfaceRegion(surface);
    let seed = 0;
    for (let call = 0; call < 9; call++) seed = dissolveSurfacePixels(region, region, seed, 1, 0x99887766);
    for (let i = 0; i < 9; i++) expect(getSurfacePixel32(surface, i % 3, (i / 3) | 0)).toBe(0x99887766);
  });

  it('ignores fillColor and copies from source when regions differ', () => {
    const source = createSurface(2, 2, 0x0a0b0c0d);
    const dest = createSurface(2, 2, 0x00000000);
    let seed = 0;
    for (let call = 0; call < 4; call++) {
      seed = dissolveSurfacePixels(createSurfaceRegion(dest), createSurfaceRegion(source), seed, 1, 0xffffffff);
    }
    expect(Array.from(dest.data)).toEqual(Array.from(source.data));
  });

  it('returns the seed unchanged for a non-positive pixelCount without writing', () => {
    const source = createSurface(4, 4, 0x112233ff);
    const dest = createSurface(4, 4, 0x00000000);
    const original = dest.data.slice();
    expect(dissolveSurfacePixels(createSurfaceRegion(dest), createSurfaceRegion(source), 2, 0)).toBe(2);
    expect(countChangedPixels(dest.data, original)).toBe(0);
  });

  it('returns the seed for a zero-area region', () => {
    const source = createSurface(4, 4, 0x112233ff);
    const dest = createSurface(4, 4, 0x00000000);
    const region = createSurfaceRegion(dest, 0, 0, 0, 0);
    expect(dissolveSurfacePixels(region, createSurfaceRegion(source), 5, 10)).toBe(5);
  });
});
