import { createDropShadowEffect } from '@flighthq/effects/contract';

import {
  applyDropShadowEffectToCanvas,
  defaultCanvasDropShadowEffectRunner,
  registerCanvasDropShadowEffect,
} from './canvasDropShadowEffect';
import * as canvasEffectCompositing from './canvasEffectCompositing';
import { canvasTestSurfaceCreator } from './canvasEffectTestSupport';
import * as canvasRenderEffectPipeline from './canvasRenderEffectPipeline';
import * as canvasSourceModeCompositing from './canvasSourceModeCompositing';

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;

  vi.spyOn(canvasEffectCompositing, 'drawCanvasEffectPass').mockImplementation((() => {}) as never);

  vi.spyOn(canvasRenderEffectPipeline, 'acquireCanvasRenderTarget').mockImplementation(((
    _pool: never,
    width: number,
    height: number,
  ) => ({
    id: `scratch-${nextTargetId++}`,
    canvas: {},
    context: {},
    width,
    height,
  })) as never);
  vi.spyOn(canvasRenderEffectPipeline, 'createCanvasRenderTargetPool').mockImplementation((() => ({
    free: [],
    inUse: [],
  })) as never);
  vi.spyOn(canvasRenderEffectPipeline, 'releaseCanvasRenderTarget').mockImplementation((() => {}) as never);

  vi.spyOn(canvasSourceModeCompositing, 'clearCanvasTarget').mockImplementation((() => {}) as never);
  vi.spyOn(canvasSourceModeCompositing, 'compositeCanvasImage').mockImplementation((() => {}) as never);
  vi.spyOn(canvasSourceModeCompositing, 'compositeCanvasSourceMode').mockImplementation((() => {}) as never);
  vi.spyOn(canvasSourceModeCompositing, 'drawCanvasTintedAlphaMask').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyDropShadowEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToCanvas).toBe('function');
  });

  it('uses the CSS drop-shadow path for default draw mode', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToCanvas(source, dest, createDropShadowEffect());

    expect(canvasEffectCompositing.drawCanvasEffectPass).toHaveBeenCalledWith(
      dest,
      source,
      'drop-shadow(3px 3px 4px rgba(0,0,0,1.000))',
    );
    expect(canvasSourceModeCompositing.compositeCanvasSourceMode).not.toHaveBeenCalled();
  });

  it('routes hide mode through explicit source-mode compositing', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToCanvas(source, dest, createDropShadowEffect({ sourceMode: 'hide' }));

    expect(canvasSourceModeCompositing.compositeCanvasSourceMode).toHaveBeenCalledWith(dest, source, 'hide');
  });

  it('routes knockout mode through explicit source-mode compositing', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToCanvas(source, dest, createDropShadowEffect({ sourceMode: 'knockout' }));

    expect(canvasSourceModeCompositing.compositeCanvasSourceMode).toHaveBeenCalledWith(dest, source, 'knockout');
  });
});

describe('defaultCanvasDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasDropShadowEffectRunner).toBe('function');
  });
});

describe('registerCanvasDropShadowEffect', () => {
  it('is a function', () => expect(registerCanvasDropShadowEffect).toBeTypeOf('function'));
});

function createTarget(id: string, width = 32, height = 16): never {
  return { id, canvas: {}, context: {}, surface: { creator: canvasTestSurfaceCreator }, width, height } as never;
}

describe('registerCanvasDropShadowEffect', () => {
  it('is a function', () => {
    expect(typeof registerCanvasDropShadowEffect).toBe('function');
  });
});
