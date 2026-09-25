import { emitSignal } from '@flighthq/signals/contract';
import type { RenderState, RenderTargetDimensions, Viewport } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  attachAppRenderView,
  createAppRenderView,
  detachAppRenderView,
  initializeAppRenderView,
  synchronizeAppRenderView,
} from './appRenderView.ts';
import { createAppWindow } from './appWindow.ts';

describe('attachAppRenderView', () => {
  it('tracks window resize through one idempotent signal connection', () => {
    const { resize, target, view, window } = makeView();
    attachAppRenderView(view);
    attachAppRenderView(view);
    resize.mockClear();

    window.width = 40;
    emitSignal(window.onResize);

    expect(resize).toHaveBeenCalledTimes(1);
    expect(target.width).toBe(80);
  });
});

describe('createAppRenderView', () => {
  it('links the four independently accessible components on an Entity', () => {
    const { state, target, view, viewport, window } = makeView();

    expect(view.window).toBe(window);
    expect(view.renderState).toBe(state);
    expect(view.renderTarget).toBe(target);
    expect(view.viewport).toBe(viewport);
    expect(view[EntityRuntimeKey]).toBeDefined();
  });
});

describe('detachAppRenderView', () => {
  it('stops window-driven synchronization without releasing the linked components', () => {
    const { resize, view, window } = makeView();
    attachAppRenderView(view);
    detachAppRenderView(view);
    resize.mockClear();

    window.width = 40;
    emitSignal(window.onResize);

    expect(resize).not.toHaveBeenCalled();
    expect(view.window).toBe(window);
  });
});

describe('initializeAppRenderView', () => {
  it('is the construction initializer of createAppRenderView', () => {
    expect(typeof initializeAppRenderView).toBe('function');
  });
});

function makeView() {
  const window = createAppWindow();
  window.width = 20;
  window.height = 10;
  window.devicePixelRatio = 2;
  const state = {
    pixelRatio: 1,
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
  const view = createAppRenderView(window, state, target, viewport, resize);
  return { resize, state, target, view, viewport, window };
}

describe('synchronizeAppRenderView', () => {
  it('writes device-pixel target, viewport, and render-state values from the window authority', () => {
    const { resize, state, target, view, viewport, window } = makeView();
    window.width = 100;
    window.height = 60;
    window.devicePixelRatio = 1.5;
    viewport.x = 8;
    viewport.y = 9;
    resize.mockClear();

    synchronizeAppRenderView(view);

    expect(resize).toHaveBeenCalledWith(state, target, 150, 90);
    expect(viewport).toMatchObject({ devicePixelRatio: 1.5, height: 90, width: 150, x: 0, y: 0 });
    expect(state.pixelRatio).toBe(1.5);
  });

  it('invokes the backend resize seam even when the requested extent is unchanged', () => {
    const { resize, view } = makeView();
    resize.mockClear();

    synchronizeAppRenderView(view);

    expect(resize).toHaveBeenCalledOnce();
  });
});
