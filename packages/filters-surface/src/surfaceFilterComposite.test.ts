import { createSurface } from '@flighthq/surface';
import type { BitmapFilter, DropShadowFilter, Surface, SurfaceRegion } from '@flighthq/types';

import {
  compositeDropShadowFilterResultToSurface,
  compositeFilterResultToSurface,
  computeFilterSurfaceOffset,
  getFilterCompositeRole,
} from './surfaceFilterComposite';

function region(surface: Surface): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makePixels(w: number, h: number, color = 0): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(w * h * 4);
  const r = (color >>> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const a = color & 0xff;
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  }
  return pixels;
}

describe('compositeDropShadowFilterResultToSurface', () => {
  it('composites mask and source for non-knockout filter', () => {
    const dest = createSurface(4, 4);
    const source = createSurface(4, 4, 0xff0000ff);
    const mask = makePixels(4, 4, 0x0000ffff);
    const f = { kind: 'DropShadowFilter', angle: 0, distance: 0 } as unknown as DropShadowFilter;
    compositeDropShadowFilterResultToSurface(region(dest), mask, region(source), f);
    // Source (red) composited on top of mask (blue) — dest should have red pixels
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[2]).toBe(0x00);
  });
  it('knockout: composites only mask, omits source', () => {
    const dest = createSurface(4, 4);
    const source = createSurface(4, 4, 0xff0000ff);
    const mask = makePixels(4, 4, 0x0000ffff);
    const f = {
      kind: 'DropShadowFilter',
      angle: 0,
      distance: 0,
      knockout: true,
    } as unknown as DropShadowFilter;
    compositeDropShadowFilterResultToSurface(region(dest), mask, region(source), f);
    // Only mask (blue) composited — no red source
    expect(dest.data[0]).toBe(0x00);
    expect(dest.data[2]).toBe(0xff);
  });
  it('hideObject: composites only mask at offset, omits source', () => {
    const dest = createSurface(8, 8);
    const source = createSurface(4, 4, 0xff0000ff);
    const mask = makePixels(4, 4, 0x0000ffff);
    const f = {
      kind: 'DropShadowFilter',
      angle: 0,
      distance: 4,
      hideObject: true,
    } as unknown as DropShadowFilter;
    compositeDropShadowFilterResultToSurface(region(dest), mask, region(source), f);
    // Mask composited at (4, 0) offset — origin of dest should be transparent
    expect(dest.data[3]).toBe(0);
    // Pixel at (4, 0) should have the mask color
    const idx = (0 * 8 + 4) * 4;
    expect(dest.data[idx + 2]).toBe(0xff);
  });
});

describe('compositeFilterResultToSurface', () => {
  it('outer effect: mask first, source on top for non-knockout', () => {
    const dest = createSurface(4, 4);
    const source = createSurface(4, 4, 0xff0000ff);
    const mask = makePixels(4, 4, 0x0000ffff);
    const f = { kind: 'OuterGlowFilter' } as unknown as BitmapFilter;
    compositeFilterResultToSurface(region(dest), mask, region(source), f);
    // Source (red, opaque) composited on top of mask (blue) — result is red
    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[2]).toBe(0x00);
  });
  it('outer effect with knockout: only mask composited', () => {
    const dest = createSurface(4, 4);
    const source = createSurface(4, 4, 0xff0000ff);
    const mask = makePixels(4, 4, 0x0000ffff);
    const f = { kind: 'OuterGlowFilter', knockout: true } as unknown as BitmapFilter;
    compositeFilterResultToSurface(region(dest), mask, region(source), f);
    // Only mask (blue) — no red
    expect(dest.data[0]).toBe(0x00);
    expect(dest.data[2]).toBe(0xff);
  });
  it('inner effect: source first, mask on top for non-knockout', () => {
    const dest = createSurface(4, 4);
    const source = createSurface(4, 4, 0x00ff00ff);
    const mask = makePixels(4, 4, 0xff000080); // semi-transparent red mask
    const f = { kind: 'InnerGlowFilter' } as unknown as BitmapFilter;
    compositeFilterResultToSurface(region(dest), mask, region(source), f);
    // Source goes in first, mask blends on top — result has some red channel
    expect(dest.data[0]).toBeGreaterThan(0);
  });
  it('inner effect without knockout: source and mask both composited', () => {
    const dest = createSurface(4, 4);
    const source = createSurface(4, 4, 0x00ff00ff);
    const mask = makePixels(4, 4, 0xff0000ff);
    const f = { kind: 'InnerShadowFilter' } as unknown as BitmapFilter;
    compositeFilterResultToSurface(region(dest), mask, region(source), f);
    // Source (green) composited first, then mask (red) on top — dest has both contributions.
    // Red channel from mask should be non-zero.
    expect(dest.data[0]).toBeGreaterThan(0);
  });
});

describe('computeFilterSurfaceOffset', () => {
  it('allocates a new object each call', () => {
    const f = { kind: 'DropShadowFilter', angle: 0, distance: 4 } as unknown as DropShadowFilter;
    const a = computeFilterSurfaceOffset(f);
    const b = computeFilterSurfaceOffset(f);
    expect(a).not.toBe(b);
  });
  it('returns dx/dy derived from angle and distance', () => {
    const f = { kind: 'DropShadowFilter', angle: 0, distance: 8 } as unknown as DropShadowFilter;
    const result = computeFilterSurfaceOffset(f);
    expect(result.dx).toBe(8);
    expect(result.dy).toBe(0);
  });
});

describe('getFilterCompositeRole', () => {
  it('BevelFilter returns outer', () => {
    const f = { kind: 'BevelFilter' } as unknown as BitmapFilter;
    expect(getFilterCompositeRole(f)).toBe('outer');
  });
  it('DropShadowFilter returns outer-offset', () => {
    const f = { kind: 'DropShadowFilter' } as unknown as BitmapFilter;
    expect(getFilterCompositeRole(f)).toBe('outer-offset');
  });
  it('InnerGlowFilter returns inner', () => {
    const f = { kind: 'InnerGlowFilter' } as unknown as BitmapFilter;
    expect(getFilterCompositeRole(f)).toBe('inner');
  });
  it('InnerShadowFilter returns inner', () => {
    const f = { kind: 'InnerShadowFilter' } as unknown as BitmapFilter;
    expect(getFilterCompositeRole(f)).toBe('inner');
  });
  it('OuterGlowFilter returns outer', () => {
    const f = { kind: 'OuterGlowFilter' } as unknown as BitmapFilter;
    expect(getFilterCompositeRole(f)).toBe('outer');
  });
  it('unknown kind returns outer', () => {
    expect(getFilterCompositeRole({ kind: 'CustomFilter' } as unknown as BitmapFilter)).toBe('outer');
  });
});
