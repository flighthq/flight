import { getCanvasActiveRenderPass } from '@flighthq/scene2d-canvas/contract';
import { getSurfaceHandle } from '@flighthq/surface/contract';

import {
  acquireTestCanvasSurface,
  createCanvasRenderState,
  createCanvasRenderStateWithoutPass,
  createCanvasTextureRenderTarget,
} from './canvasEffectTestSupport.ts';

describe('acquireTestCanvasSurface', () => {
  it('returns an owned effect-test surface', () => {
    const surface = acquireTestCanvasSurface(12, 8);
    const canvas = getSurfaceHandle(surface) as HTMLCanvasElement;

    expect(canvas.width).toBe(12);
    expect(canvas.height).toBe(8);
  });
});

describe('createCanvasRenderState', () => {
  it('wraps the supplied effect-test canvas', () => {
    const canvas = document.createElement('canvas');

    expect(createCanvasRenderState(canvas).canvas).toBe(canvas);
  });
});

describe('createCanvasRenderStateWithoutPass', () => {
  it('leaves the state with no pass open, for tests whose subject is registration', () => {
    const state = createCanvasRenderStateWithoutPass();

    expect(getCanvasActiveRenderPass(state)).toBeNull();
  });
});

describe('createCanvasTextureRenderTarget', () => {
  it('creates a sized effect-test target', () => {
    const target = createCanvasTextureRenderTarget(12, 8);

    expect(target.width).toBe(12);
    expect(target.height).toBe(8);
  });
});
