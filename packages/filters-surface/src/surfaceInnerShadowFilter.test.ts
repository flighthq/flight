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

  it('offsets the shadow by the filter angle + distance (horizontal for angle 0)', () => {
    // A filled bar (columns 1..3) in a 5-wide row; columns 0 and 4 are exterior.
    const source = createSurface(5, 1);
    for (let px = 1; px <= 3; px++) source.data[px * 4 + 3] = 255;
    const out = makeOut(5, 1);
    const blurBuffer = makeOut(5, 1);
    // angle 0 -> offset (distance, 0): the shadow gathers on the column the offset points away from.
    applyInnerShadowFilterToSurface(out, blurBuffer, region(source), {
      kind: 'InnerShadowFilter',
      angle: 0,
      blurX: 1,
      blurY: 0,
      distance: 2,
      quality: 1,
    });
    // Left interior edge is darker than the right — the shadow is no longer centered on the boundary.
    expect(out[1 * 4 + 3]).toBeGreaterThan(out[3 * 4 + 3]);
  });
});
