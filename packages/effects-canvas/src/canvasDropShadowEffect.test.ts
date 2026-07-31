import type * as CanvasdropshadoweffectModule from './canvasDropShadowEffect';
import type * as CanvaseffectcompositingModule from './canvasEffectCompositing';
import type * as CanvassourcemodecompositingModule from './canvasSourceModeCompositing';

// Mocked per file with doMock plus dynamic imports of the subject, not top-level hoisted vi.mock.
// The suite runs isolate:false over a shared module registry, so a hoisted mock is registered for
// every file in the worker rather than this one -- see the rule in the root vitest config.
let applyDropShadowEffectToCanvas: typeof CanvasdropshadoweffectModule.applyDropShadowEffectToCanvas;
let defaultCanvasDropShadowEffectRunner: typeof CanvasdropshadoweffectModule.defaultCanvasDropShadowEffectRunner;
let drawCanvasEffectPass: typeof CanvaseffectcompositingModule.drawCanvasEffectPass;
let compositeCanvasSourceMode: typeof CanvassourcemodecompositingModule.compositeCanvasSourceMode;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('./canvasEffectCompositing', () => ({
    drawCanvasEffectPass: vi.fn(),
  }));
  vi.doMock('./canvasRenderEffectPipeline', () => {
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
  vi.doMock('./canvasSourceModeCompositing', () => ({
    clearCanvasTarget: vi.fn(),
    compositeCanvasImage: vi.fn(),
    compositeCanvasSourceMode: vi.fn(),
    drawCanvasTintedAlphaMask: vi.fn(),
  }));
  ({ applyDropShadowEffectToCanvas, defaultCanvasDropShadowEffectRunner } = await import('./canvasDropShadowEffect'));
  ({ drawCanvasEffectPass } = await import('./canvasEffectCompositing'));
  ({ compositeCanvasSourceMode } = await import('./canvasSourceModeCompositing'));
});

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
