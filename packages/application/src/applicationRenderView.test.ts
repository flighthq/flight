import { emitSignal } from '@flighthq/signals/contract';
import type { Matrix, RenderState, RenderTargetDimensions, Viewport } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  attachApplicationRenderView,
  createApplicationRenderView,
  detachApplicationRenderView,
  initializeApplicationRenderView,
  synchronizeApplicationRenderView,
} from './applicationRenderView';
import { createApplicationWindow } from './window';

describe('attachApplicationRenderView', () => {
  it('tracks window resize through one idempotent signal connection', () => {
    const { resize, target, view, window } = makeView();
    attachApplicationRenderView(view);
    attachApplicationRenderView(view);
    resize.mockClear();

    window.width = 40;
    emitSignal(window.onResize);

    expect(resize).toHaveBeenCalledTimes(1);
    expect(target.width).toBe(80);
  });
});

describe('createApplicationRenderView', () => {
  it('links the four independently accessible components on an Entity', () => {
    const { state, target, view, viewport, window } = makeView();

    expect(view.window).toBe(window);
    expect(view.renderState).toBe(state);
    expect(view.renderTarget).toBe(target);
    expect(view.viewport).toBe(viewport);
    expect(view[EntityRuntimeKey]).toBeDefined();
  });
});

describe('detachApplicationRenderView', () => {
  it('stops window-driven synchronization without releasing the linked components', () => {
    const { resize, view, window } = makeView();
    attachApplicationRenderView(view);
    detachApplicationRenderView(view);
    resize.mockClear();

    window.width = 40;
    emitSignal(window.onResize);

    expect(resize).not.toHaveBeenCalled();
    expect(view.window).toBe(window);
  });
});

describe('initializeApplicationRenderView', () => {
  it('is the construction initializer of createApplicationRenderView', () => {
    expect(typeof initializeApplicationRenderView).toBe('function');
  });
});

function makeView() {
  const window = createApplicationWindow();
  window.width = 20;
  window.height = 10;
  window.devicePixelRatio = 2;
  const state = {
    pixelRatio: 1,
    renderTransform2D: makeMatrix(),
  } as RenderState;
  const target: RenderTargetDimensions = { height: 1, width: 1 };
  const viewport = {
    devicePixelRatio: 1,
    height: 1,
    width: 1,
    x: 0,
    y: 0,
  } as Viewport;
  const resize = vi.fn((_state: RenderState, resizedTarget: RenderTargetDimensions, width: number, height: number) => {
    resizedTarget.width = width;
    resizedTarget.height = height;
  });
  const view = createApplicationRenderView(window, state, target, viewport, resize);
  return { resize, state, target, view, viewport, window };
}

function makeMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } as Matrix;
}
describe('synchronizeApplicationRenderView', () => {
  it('writes device-pixel target, viewport, and render-state values from the window authority', () => {
    const { resize, state, target, view, viewport, window } = makeView();
    window.width = 100;
    window.height = 60;
    window.devicePixelRatio = 1.5;
    viewport.x = 8;
    viewport.y = 9;
    resize.mockClear();

    synchronizeApplicationRenderView(view);

    expect(resize).toHaveBeenCalledWith(state, target, 150, 90);
    expect(viewport).toMatchObject({ devicePixelRatio: 1.5, height: 90, width: 150, x: 0, y: 0 });
    expect(state.pixelRatio).toBe(1.5);
    expect(state.renderTransform2D).toMatchObject({ a: 1.5, b: 0, c: 0, d: 1.5, tx: 0, ty: 0 });
  });

  it('invokes the backend resize seam even when the requested extent is unchanged', () => {
    const { resize, view } = makeView();
    resize.mockClear();

    synchronizeApplicationRenderView(view);

    expect(resize).toHaveBeenCalledOnce();
  });
});
