import { createSurface } from '@flighthq/surface';
import type { SurfaceRegion } from '@flighthq/types';

import { applyColorMatrixFilterToSurface } from './surfaceColorMatrixFilter';

function region(surface: ReturnType<typeof createSurface>): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeOut(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyColorMatrixFilterToSurface', () => {
  it('identity matrix preserves source pixels', () => {
    const source = createSurface(2, 2, 0x336699ff);
    const out = makeOut(2, 2);
    const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    applyColorMatrixFilterToSurface(out, region(source), { kind: 'ColorMatrixFilter', matrix: identity });
    expect(out[0]).toBe(0x33);
    expect(out[1]).toBe(0x66);
    expect(out[2]).toBe(0x99);
    expect(out[3]).toBe(0xff);
  });
});
