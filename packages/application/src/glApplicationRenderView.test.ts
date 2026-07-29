import { emitSignal } from '@flighthq/signals/contract';
import type { GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import { attachApplicationRenderView, synchronizeApplicationRenderView } from './applicationRenderView';
import { createGlApplicationRenderView, destroyGlApplicationRenderView } from './glApplicationRenderView';
import { createApplicationWindow } from './window';

const mocks = vi.hoisted(() => ({
  createGlRenderState: vi.fn(),
  createGlRenderTarget: vi.fn(),
  createViewport: vi.fn(),
  destroyGlRenderState: vi.fn(),
  destroyGlRenderTarget: vi.fn(),
  invalidateGlRenderStateCache: vi.fn(),
  resizeGlRenderTarget: vi.fn(),
}));

vi.mock('@flighthq/node/contract', () => ({
  createViewport: mocks.createViewport,
}));

vi.mock('@flighthq/render-gl/contract', () => ({
  createGlRenderState: mocks.createGlRenderState,
  createGlRenderTarget: mocks.createGlRenderTarget,
  destroyGlRenderState: mocks.destroyGlRenderState,
  destroyGlRenderTarget: mocks.destroyGlRenderTarget,
  invalidateGlRenderStateCache: mocks.invalidateGlRenderStateCache,
  resizeGlRenderTarget: mocks.resizeGlRenderTarget,
}));

beforeEach(() => {
  mocks.createGlRenderState.mockImplementation((canvas: HTMLCanvasElement, options: { pixelRatio: number }) => ({
    canvas,
    pixelRatio: options.pixelRatio,
    renderTransform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  }));
  mocks.createGlRenderTarget.mockImplementation(
    (_state: GlRenderState, descriptor: { height: number; width: number }) => ({
      height: Math.max(1, descriptor.height),
      width: Math.max(1, descriptor.width),
    }),
  );
  mocks.createViewport.mockImplementation((options) => ({ ...options, x: 0, y: 0 }));
  mocks.resizeGlRenderTarget.mockImplementation(
    (_state: GlRenderState, target: GlRenderTarget, width: number, height: number) => {
      target.width = Math.max(1, width);
      target.height = Math.max(1, height);
    },
  );
});

describe('createGlApplicationRenderView', () => {
  it('allocates and links the GL state, target, and device-pixel viewport', () => {
    const window = createApplicationWindow();
    window.width = 320;
    window.height = 180;
    window.devicePixelRatio = 2;
    const canvas = document.createElement('canvas');

    const view = createGlApplicationRenderView(window, canvas, {
      render: { antialias: false },
      target: { colorSpace: 'linear', depth: 'depth-stencil' },
    });

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(mocks.createGlRenderState).toHaveBeenCalledWith(canvas, { antialias: false, pixelRatio: 2 });
    expect(mocks.createGlRenderTarget).toHaveBeenCalledWith(view.renderState, {
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
    const view = createGlApplicationRenderView(window, canvas);
    mocks.invalidateGlRenderStateCache.mockClear();
    mocks.resizeGlRenderTarget.mockClear();

    synchronizeApplicationRenderView(view);
    expect(mocks.invalidateGlRenderStateCache).not.toHaveBeenCalled();
    expect(mocks.resizeGlRenderTarget).not.toHaveBeenCalled();

    window.width = 30;
    synchronizeApplicationRenderView(view);
    expect(canvas.width).toBe(30);
    expect(mocks.invalidateGlRenderStateCache).toHaveBeenCalledWith(view.renderState);
    expect(mocks.resizeGlRenderTarget).toHaveBeenCalledWith(view.renderState, view.renderTarget, 30, 10);
  });
});

describe('destroyGlApplicationRenderView', () => {
  it('detaches resize observation and destroys the owned target before the state', () => {
    const window = createApplicationWindow();
    window.width = 20;
    window.height = 10;
    const view = createGlApplicationRenderView(window, document.createElement('canvas'));
    attachApplicationRenderView(view);
    mocks.resizeGlRenderTarget.mockClear();

    destroyGlApplicationRenderView(view);
    window.width = 30;
    emitSignal(window.onResize);

    expect(mocks.resizeGlRenderTarget).not.toHaveBeenCalled();
    expect(mocks.destroyGlRenderTarget).toHaveBeenCalledWith(view.renderState, view.renderTarget);
    expect(mocks.destroyGlRenderState).toHaveBeenCalledWith(view.renderState);
  });
});
