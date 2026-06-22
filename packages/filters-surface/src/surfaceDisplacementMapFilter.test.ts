import { createSurface } from '@flighthq/surface';
import type { SurfaceRegion } from '@flighthq/types';

import { applyDisplacementMapFilterToSurface } from './surfaceDisplacementMapFilter';

function region(surface: ReturnType<typeof createSurface>): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeOut(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyDisplacementMapFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const map = createSurface(4, 4, 0x808080ff);
    const out = makeOut(4, 4);
    expect(() =>
      applyDisplacementMapFilterToSurface(out, region(source), region(map), {
        kind: 'DisplacementMapFilter',
        scaleX: 0,
        scaleY: 0,
      }),
    ).not.toThrow();
  });
});
