import { createSurface } from '@flighthq/surface';
import type { SurfaceRegion } from '@flighthq/types';

import { applyBlurFilterToSurface } from './surfaceBlurFilter';

function region(surface: ReturnType<typeof createSurface>): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeOut(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyBlurFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyBlurFilterToSurface(out, blurBuffer, region(source), { kind: 'BlurFilter', blurX: 4, blurY: 4 }),
    ).not.toThrow();
  });

  it('copies source when blurX and blurY are zero', () => {
    const source = createSurface(2, 2, 0x336699ff);
    const out = makeOut(2, 2);
    const blurBuffer = makeOut(2, 2);
    applyBlurFilterToSurface(out, blurBuffer, region(source), { kind: 'BlurFilter', blurX: 0, blurY: 0 });
    expect(out[0]).toBe(0x33);
    expect(out[3]).toBe(0xff);
  });
});
