import {
  acquireTestCanvasRenderSurface,
  createCanvasRenderState,
  createCanvasRenderTarget,
} from './canvasEffectTestSupport';

describe('acquireTestCanvasRenderSurface', () => {
  it('returns an owned effect-test surface', () => {
    const surface = acquireTestCanvasRenderSurface(12, 8);

    expect(surface.canvas.width).toBe(12);
    expect(surface.canvas.height).toBe(8);
  });
});

describe('createCanvasRenderState', () => {
  it('wraps the supplied effect-test canvas', () => {
    const canvas = document.createElement('canvas');

    expect(createCanvasRenderState(canvas).canvas).toBe(canvas);
  });
});

describe('createCanvasRenderTarget', () => {
  it('creates a sized effect-test target', () => {
    const target = createCanvasRenderTarget(12, 8);

    expect(target.width).toBe(12);
    expect(target.height).toBe(8);
  });
});
