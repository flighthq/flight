import { createOuterGlowEffect } from '@flighthq/effects/contract';

import * as canvasEffectCompositing from './canvasEffectCompositing';
import { canvasTestSurfaceCreator } from './canvasEffectTestSupport';
import {
  applyOuterGlowEffectToCanvas,
  defaultCanvasOuterGlowEffectRunner,
  registerCanvasOuterGlowEffect,
} from './canvasOuterGlowEffect';
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

describe('applyOuterGlowEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToCanvas).toBe('function');
  });

  it('uses the CSS drop-shadow path for default draw mode', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToCanvas(source, dest, createOuterGlowEffect());

    expect(canvasEffectCompositing.drawCanvasEffectPass).toHaveBeenCalledWith(
      dest,
      source,
      'drop-shadow(0px 0px 6px rgba(255,0,0,1.000))',
    );
    expect(canvasSourceModeCompositing.compositeCanvasSourceMode).not.toHaveBeenCalled();
  });

  it('routes hide mode through explicit source-mode compositing', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToCanvas(source, dest, createOuterGlowEffect({ sourceMode: 'hide' }));

    expect(canvasSourceModeCompositing.compositeCanvasSourceMode).toHaveBeenCalledWith(dest, source, 'hide');
  });

  it('routes knockout mode through explicit source-mode compositing', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToCanvas(source, dest, createOuterGlowEffect({ sourceMode: 'knockout' }));

    expect(canvasSourceModeCompositing.compositeCanvasSourceMode).toHaveBeenCalledWith(dest, source, 'knockout');
  });
});

describe('defaultCanvasOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasOuterGlowEffectRunner).toBe('function');
  });
});

describe('registerCanvasOuterGlowEffect', () => {
  it('is a function', () => expect(registerCanvasOuterGlowEffect).toBeTypeOf('function'));
});

function createTarget(id: string, width = 32, height = 16): never {
  return { id, canvas: {}, context: {}, surface: { creator: canvasTestSurfaceCreator }, width, height } as never;
}

describe('registerCanvasOuterGlowEffect', () => {
  it('is a function', () => {
    expect(typeof registerCanvasOuterGlowEffect).toBe('function');
  });
});
