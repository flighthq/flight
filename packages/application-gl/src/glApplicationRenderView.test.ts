import {
  attachApplicationRenderView,
  createApplicationWindow,
  synchronizeApplicationRenderView,
} from '@flighthq/application/contract';
import * as nodeContract from '@flighthq/node/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type { GlPipeline, GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import { createGlApplicationRenderView, destroyGlApplicationRenderView } from './glApplicationRenderView';

beforeEach(() => {
  vi.spyOn(nodeContract, 'createViewport').mockImplementation((options) => ({ ...options, x: 0, y: 0 }) as never);

  vi.spyOn(renderGlContract, 'createGlContextFromCanvasElement').mockImplementation(
    () => ({ drawingBufferHeight: 0, drawingBufferWidth: 0 }) as never,
  );
  vi.spyOn(renderGlContract, 'createGlContextState').mockImplementation(((gl: never) => ({ gl })) as never);
  vi.spyOn(renderGlContract, 'createGlRenderState').mockImplementation(((
    contextState: never,
    _pipeline: never,
    options: { pixelRatio: number },
  ) => ({
    contextState,
    gl: (contextState as { gl: unknown }).gl,
    pixelRatio: options.pixelRatio,
    renderTransform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  })) as never);
  vi.spyOn(renderGlContract, 'createGlRenderTarget').mockImplementation(((
    _state: GlRenderState,
    descriptor: { height: number; width: number },
  ) => ({
    height: Math.max(1, descriptor.height),
    width: Math.max(1, descriptor.width),
  })) as never);
  vi.spyOn(renderGlContract, 'destroyGlRenderState').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'destroyGlRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'invalidateGlRenderStateCache').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'resizeGlRenderTarget').mockImplementation(((
    _state: GlRenderState,
    target: GlRenderTarget,
    width: number,
    height: number,
  ) => {
    target.width = Math.max(1, width);
    target.height = Math.max(1, height);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pipeline = {} as GlPipeline;

describe('createGlApplicationRenderView', () => {
  it('allocates and links the GL state, target, and device-pixel viewport', () => {
    const window = createApplicationWindow();
    window.width = 320;
    window.height = 180;
    window.devicePixelRatio = 2;
    const canvas = document.createElement('canvas');

    const view = createGlApplicationRenderView(window, canvas, {
      context: { antialias: false },
      pipeline,
      render: { roundPixels: true },
      target: { colorSpace: 'linear', depth: 'depth-stencil' },
    });

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(renderGlContract.createGlContextFromCanvasElement).toHaveBeenCalledWith(canvas, { antialias: false });
    expect(renderGlContract.createGlContextState).toHaveBeenCalledWith(
      vi.mocked(renderGlContract.createGlContextFromCanvasElement).mock.results[0].value,
    );
    expect(renderGlContract.createGlRenderState).toHaveBeenCalledWith(
      vi.mocked(renderGlContract.createGlContextState).mock.results[0].value,
      pipeline,
      {
        pixelRatio: 2,
        roundPixels: true,
      },
    );
    expect(renderGlContract.createGlRenderTarget).toHaveBeenCalledWith(view.renderState, {
      colorSpace: 'linear',
      depth: 'depth-stencil',
      height: 360,
      width: 640,
    });
    expect(view.viewport).toMatchObject({ devicePixelRatio: 2, height: 360, width: 640, x: 0, y: 0 });
  });

  it('changes the backing store and target only when a synchronized window extent changes', () => {
    const window = createApplicationWindow();
    window.width = 20;
    window.height = 10;
    const canvas = document.createElement('canvas');
    const view = createGlApplicationRenderView(window, canvas, { pipeline });
    vi.mocked(renderGlContract.invalidateGlRenderStateCache).mockClear();
    vi.mocked(renderGlContract.resizeGlRenderTarget).mockClear();

    synchronizeApplicationRenderView(view);
    expect(renderGlContract.invalidateGlRenderStateCache).not.toHaveBeenCalled();
    expect(renderGlContract.resizeGlRenderTarget).not.toHaveBeenCalled();

    window.width = 30;
    synchronizeApplicationRenderView(view);
    expect(canvas.width).toBe(30);
    expect(renderGlContract.invalidateGlRenderStateCache).toHaveBeenCalledWith(view.renderState);
    expect(renderGlContract.resizeGlRenderTarget).toHaveBeenCalledWith(view.renderState, view.renderTarget, 30, 10);
  });
});

describe('destroyGlApplicationRenderView', () => {
  it('detaches resize observation and destroys the owned target before the state', () => {
    const window = createApplicationWindow();
    window.width = 20;
    window.height = 10;
    const view = createGlApplicationRenderView(window, document.createElement('canvas'), { pipeline });
    attachApplicationRenderView(view);
    vi.mocked(renderGlContract.resizeGlRenderTarget).mockClear();

    destroyGlApplicationRenderView(view);
    window.width = 30;
    emitSignal(window.onResize);

    expect(renderGlContract.resizeGlRenderTarget).not.toHaveBeenCalled();
    expect(renderGlContract.destroyGlRenderTarget).toHaveBeenCalledWith(view.renderState, view.renderTarget);
    expect(renderGlContract.destroyGlRenderState).toHaveBeenCalledWith(view.renderState);
  });
});
