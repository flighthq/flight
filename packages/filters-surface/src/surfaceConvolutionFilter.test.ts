import { createSurface } from '@flighthq/surface';
import type { SurfaceRegion } from '@flighthq/types';

import { applyConvolutionFilterToSurface } from './surfaceConvolutionFilter';

function region(surface: ReturnType<typeof createSurface>): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeOut(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyConvolutionFilterToSurface', () => {
  it('pass-through kernel copies source', () => {
    const source = createSurface(3, 3, 0x336699ff);
    const out = makeOut(3, 3);
    applyConvolutionFilterToSurface(out, region(source), {
      kind: 'ConvolutionFilter',
      matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      matrixX: 3,
      matrixY: 3,
    });
    expect(out[0]).toBe(0x33);
  });
});
