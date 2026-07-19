vi.hoisted(() => {
  vi.resetModules();
});

vi.mock('./canvasEffectCompositing', () => ({
  drawCanvasEffectPass: vi.fn(),
}));

vi.mock('./canvasRenderEffectPipeline', () => {
  let nextTargetId = 0;
  return {
    acquireCanvasRenderTarget: vi.fn((_pool, width, height) => ({
      id: `scratch-${nextTargetId++}`,
      canvas: {},
      context: {},
      width,
      height,
    })),
    createCanvasRenderTargetPool: vi.fn(() => ({ free: [], inUse: [] })),
    releaseCanvasRenderTarget: vi.fn(),
  };
});

vi.mock('./canvasSourceModeCompositing', () => ({
  clearCanvasTarget: vi.fn(),
  compositeCanvasImage: vi.fn(),
  compositeCanvasSourceMode: vi.fn(),
  drawCanvasTintedAlphaMask: vi.fn(),
}));

import { applyDropShadowEffectToCanvas, defaultCanvasDropShadowEffectRunner } from './canvasDropShadowEffect';
import { drawCanvasEffectPass } from './canvasEffectCompositing';
import { compositeCanvasSourceMode } from './canvasSourceModeCompositing';

describe('applyDropShadowEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToCanvas).toBe('function');
  });

  it('uses the CSS drop-shadow path for default draw mode', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToCanvas(source, dest, { kind: 'DropShadowEffect' });

    expect(drawCanvasEffectPass).toHaveBeenCalledWith(dest, source, 'drop-shadow(3px 3px 4px rgba(0,0,0,1.000))');
    expect(compositeCanvasSourceMode).not.toHaveBeenCalled();
  });

  it('routes hide mode through explicit source-mode compositing', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToCanvas(source, dest, { kind: 'DropShadowEffect', sourceMode: 'hide' });

    expect(compositeCanvasSourceMode).toHaveBeenCalledWith(dest, source, 'hide');
  });

  it('routes knockout mode through explicit source-mode compositing', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToCanvas(source, dest, { kind: 'DropShadowEffect', sourceMode: 'knockout' });

    expect(compositeCanvasSourceMode).toHaveBeenCalledWith(dest, source, 'knockout');
  });
});

describe('defaultCanvasDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasDropShadowEffectRunner).toBe('function');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.doUnmock('./canvasEffectCompositing');
  vi.doUnmock('./canvasRenderEffectPipeline');
  vi.doUnmock('./canvasSourceModeCompositing');
  vi.resetModules();
});

function createTarget(id: string, width = 32, height = 16): never {
  return { id, canvas: {}, context: {}, width, height } as never;
}
