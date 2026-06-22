import { createSurface } from '@flighthq/surface';
import type { SurfaceRegion } from '@flighthq/types';

import { applyGradientBevelFilterToSurface } from './surfaceGradientBevelFilter';

function region(surface: ReturnType<typeof createSurface>): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeOut(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyGradientBevelFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyGradientBevelFilterToSurface(out, blurBuffer, region(source), {
        kind: 'GradientBevelFilter',
        colors: [0xffffff, 0x000000],
        alphas: [1, 1],
        ratios: [0, 255],
        blurX: 0,
        blurY: 0,
      }),
    ).not.toThrow();
  });
});
