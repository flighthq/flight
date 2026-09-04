import {
  acquireTestCanvasRenderSurface,
  createCanvasRenderState,
  createCanvasRenderTarget,
  createCanvasTextureResolvers,
  initializeCanvasRenderSurfaceCreator,
} from './canvasTestSupport';

describe('acquireTestCanvasRenderSurface', () => {
  it('returns an owned test surface', () => {
    const surface = acquireTestCanvasRenderSurface(12, 8);

    expect(surface.canvas.width).toBe(12);
    expect(surface.canvas.height).toBe(8);
  });
});

describe('createCanvasRenderState', () => {
  it('wraps the supplied test canvas', () => {
    const canvas = document.createElement('canvas');

    expect(createCanvasRenderState(canvas).canvas).toBe(canvas);
  });
});

describe('createCanvasRenderTarget', () => {
  it('creates a sized test target', () => {
    const target = createCanvasRenderTarget(12, 8);

    expect(target.width).toBe(12);
    expect(target.height).toBe(8);
  });
});

describe('createCanvasTextureResolvers', () => {
  it('creates an empty test resolver set', () => {
    expect(createCanvasTextureResolvers().registry).toBeNull();
  });
});
describe('initializeCanvasRenderSurfaceCreator', () => {
  it('is the construction initializer of createCanvasRenderSurfaceCreator', () => {
    expect(typeof initializeCanvasRenderSurfaceCreator).toBe('function');
  });
});
