import { getSurfaceHandle } from '@flighthq/surface/contract';

import {
  acquireTestCanvasSurface,
  beginCanvasScreenRenderPassForTest,
  createCanvasRenderState,
  createCanvasRenderStateWithoutPass,
  createCanvasScreenRenderTargetForTest,
  createCanvasTextureRenderTarget,
  createCanvasTextureResolvers,
  endCanvasRenderPass,
  getCanvasActiveRenderPass,
} from './canvasTestSupport';

describe('acquireTestCanvasSurface', () => {
  it('returns an owned test surface', () => {
    const surface = acquireTestCanvasSurface(12, 8);
    const canvas = getSurfaceHandle(surface) as HTMLCanvasElement;

    expect(canvas.width).toBe(12);
    expect(canvas.height).toBe(8);
  });
});

describe('beginCanvasScreenRenderPassForTest', () => {
  it('opens a screen pass over the given canvas in one line', () => {
    const state = createCanvasRenderStateWithoutPass();
    const canvas = document.createElement('canvas');

    const pass = beginCanvasScreenRenderPassForTest(state, canvas);

    expect(pass.target.canvas).toBe(canvas);
    expect(state.context).toBe(pass.context);
    endCanvasRenderPass(pass);
  });
});

describe('createCanvasRenderState', () => {
  it('wraps the supplied test canvas', () => {
    const canvas = document.createElement('canvas');

    expect(createCanvasRenderState(canvas).canvas).toBe(canvas);
  });
});

describe('createCanvasRenderStateWithoutPass', () => {
  it('leaves the state with no pass open, for tests whose subject is construction', () => {
    const state = createCanvasRenderStateWithoutPass();

    expect(getCanvasActiveRenderPass(state)).toBeNull();
  });
});

describe('createCanvasScreenRenderTargetForTest', () => {
  it('wraps a canvas as a screen target through the test host', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;

    const screen = createCanvasScreenRenderTargetForTest(canvas);

    expect(screen.canvas).toBe(canvas);
    expect(screen.surfaceOwnership).toBe('caller');
  });
});

describe('createCanvasTextureRenderTarget', () => {
  it('creates a sized test target', () => {
    const target = createCanvasTextureRenderTarget(12, 8);

    expect(target.width).toBe(12);
    expect(target.height).toBe(8);
  });
});

describe('createCanvasTextureResolvers', () => {
  it('creates an empty test resolver set', () => {
    expect(createCanvasTextureResolvers().registry).toBeNull();
  });
});
