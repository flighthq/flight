import { createSurface } from '@flighthq/surface';
import type { SurfaceRegion } from '@flighthq/types';

import { applyInnerShadowFilterToSurface } from './surfaceInnerShadowFilter';

function region(surface: ReturnType<typeof createSurface>): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeOut(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyInnerShadowFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyInnerShadowFilterToSurface(out, blurBuffer, region(source), {
        kind: 'InnerShadowFilter',
        blurX: 0,
        blurY: 0,
      }),
    ).not.toThrow();
  });
});
