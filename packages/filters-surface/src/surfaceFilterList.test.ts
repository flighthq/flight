import { createSurface } from '@flighthq/surface';
import type { BitmapFilter, Surface, SurfaceRegion } from '@flighthq/types';

import { applyFilterListToSurface } from './surfaceFilterList';

function region(surface: Surface): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeBuffer(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyFilterListToSurface', () => {
  it('DisplacementMapFilter entry is silently skipped (source copied through)', () => {
    const source = createSurface(4, 4, 0x336699ff);
    const out = makeBuffer(4, 4);
    const scratch = makeBuffer(4, 4);
    const f = { kind: 'DisplacementMapFilter', scaleX: 0, scaleY: 0 } as unknown as BitmapFilter;
    applyFilterListToSurface(out, scratch, region(source), [f]);
    // Displacement skipped; source copied through
    expect(out[0]).toBe(0x33);
    expect(out[1]).toBe(0x66);
  });
  it('empty filter list copies source unchanged', () => {
    const source = createSurface(4, 4, 0x336699ff);
    const out = makeBuffer(4, 4);
    const scratch = makeBuffer(4, 4);
    applyFilterListToSurface(out, scratch, region(source), []);
    expect(out[0]).toBe(0x33);
    expect(out[1]).toBe(0x66);
    expect(out[2]).toBe(0x99);
    expect(out[3]).toBe(0xff);
  });
  it('result always ends up in out regardless of number of filters', () => {
    const source = createSurface(4, 4, 0x00ff00ff);
    for (let n = 1; n <= 4; n++) {
      const out = makeBuffer(4, 4);
      const scratch = makeBuffer(4, 4);
      const f = { kind: 'BlurFilter', blurX: 0, blurY: 0 } as unknown as BitmapFilter;
      const filters = Array.from({ length: n }, () => f);
      applyFilterListToSurface(out, scratch, region(source), filters);
      // With zero blur, source pixels should be preserved in out
      expect(out[1]).toBeGreaterThan(0); // green channel from source
    }
  });
  it('single blur filter applies blur', () => {
    const source = createSurface(8, 8, 0xff0000ff);
    const out = makeBuffer(8, 8);
    const scratch = makeBuffer(8, 8);
    const f = { kind: 'BlurFilter', blurX: 2, blurY: 2 } as unknown as BitmapFilter;
    expect(() => applyFilterListToSurface(out, scratch, region(source), [f])).not.toThrow();
    // Some pixels should be written
    expect(out.some((v) => v > 0)).toBe(true);
  });
  it('single color matrix filter applies color transform', () => {
    const source = createSurface(2, 2, 0xff0000ff);
    const out = makeBuffer(2, 2);
    const scratch = makeBuffer(2, 2);
    // Zero-out red channel
    const matrix = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    const f = { kind: 'ColorMatrixFilter', matrix } as unknown as BitmapFilter;
    applyFilterListToSurface(out, scratch, region(source), [f]);
    expect(out[0]).toBe(0); // red zeroed
    expect(out[3]).toBe(0xff); // alpha preserved
  });
  it('two filters applied in sequence', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeBuffer(4, 4);
    const scratch = makeBuffer(4, 4);
    const f = { kind: 'BlurFilter', blurX: 1, blurY: 1 } as unknown as BitmapFilter;
    expect(() => applyFilterListToSurface(out, scratch, region(source), [f, f])).not.toThrow();
    expect(out.some((v) => v > 0)).toBe(true);
  });
});
