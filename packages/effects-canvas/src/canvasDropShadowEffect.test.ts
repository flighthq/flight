import { createDropShadowEffect } from '@flighthq/effects/contract';

import {
  applyDropShadowEffectToCanvas,
  canvasDropShadowEffectRunner,
  registerCanvasDropShadowEffect,
} from './canvasDropShadowEffect.ts';
import * as canvasEffectCompositing from './canvasEffectCompositing.ts';
import * as canvasEffectState from './canvasEffectState.ts';
import { canvasTestHost } from './canvasEffectTestSupport.ts';
import * as canvasSourceModeCompositing from './canvasSourceModeCompositing.ts';

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;

  vi.spyOn(canvasEffectCompositing, 'drawCanvasEffectPass').mockImplementation((() => {}) as never);

  vi.spyOn(canvasEffectState, 'acquireCanvasRenderTarget').mockImplementation(((
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
  vi.spyOn(canvasEffectState, 'createCanvasTextureRenderTargetPool').mockImplementation((() => ({
    free: [],
    inUse: [],
  })) as never);
  vi.spyOn(canvasEffectState, 'releaseCanvasRenderTarget').mockImplementation((() => {}) as never);

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

describe('canvasDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof canvasDropShadowEffectRunner).toBe('function');
  });
});

describe('registerCanvasDropShadowEffect', () => {
  it('is a function', () => expect(registerCanvasDropShadowEffect).toBeTypeOf('function'));
});

function createTarget(id: string, width = 32, height = 16): never {
  return { id, canvas: {}, context: {}, surface: { canvasHost: canvasTestHost }, width, height } as never;
}

describe('registerCanvasDropShadowEffect', () => {
  it('is a function', () => {
    expect(typeof registerCanvasDropShadowEffect).toBe('function');
  });
});
