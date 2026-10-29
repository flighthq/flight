import { allocateEntity, attachEntityBinding, finishEntity } from '@flighthq/entity/contract';
import type { RenderState, RenderTargetDimensions, Viewport } from '@flighthq/types/contract';

import type { RenderView, RenderViewResize } from './renderView.ts';
import { createRenderView, initializeRenderView, resizeRenderView } from './renderView.ts';

describe('createRenderView', () => {
  it('links the three independently accessible render components on an Entity', () => {
    const { state, target, view, viewport } = makeView();

    expect(view.renderState).toBe(state);
    expect(view.renderTarget).toBe(target);
    expect(view.viewport).toBe(viewport);
    expect('window' in view).toBe(false);
  });

  it('keeps its package runtime usable after an Entity binding is attached', () => {
    const { resize, view } = makeView();
    attachEntityBinding(view, { provider: true });

    resizeRenderView(view, 20, 10, 2, resize);

    expect(resize).toHaveBeenCalledOnce();
  });
});

describe('initializeRenderView', () => {
  it('links caller-owned components without retaining a backend callback', () => {
    const { resize, state, target, viewport } = makeComponents();
    const construction = allocateEntity<RenderView>();

    initializeRenderView(construction, state, target, viewport);
    const view = finishEntity(construction);
    resizeRenderView(view, 12, 7, 2, resize);

    expect(view.renderState).toBe(state);
    expect(view.renderTarget).toBe(target);
    expect(view.viewport).toBe(viewport);
    expect(resize).toHaveBeenCalledWith(state, target, 24, 14);
  });
});

describe('resizeRenderView', () => {
  it('uses the callback supplied for each operation instead of retaining one on the view', () => {
    const { resize: first, view } = makeView();
    const second = vi.fn<RenderViewResize>((_state, target, width, height) => {
      target.width = width;
      target.height = height;
    });

    resizeRenderView(view, 2, 2, 1, first);
    resizeRenderView(view, 3, 3, 1, second);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('writes device-pixel target, viewport, and render-state values from explicit dimensions', () => {
    const { resize, state, target, view, viewport } = makeView();
    viewport.x = 8;
    viewport.y = 9;

    resizeRenderView(view, 100, 60, 1.5, resize);

    expect(resize).toHaveBeenCalledWith(state, target, 150, 90);
    expect(viewport).toMatchObject({ devicePixelRatio: 1.5, height: 90, width: 150, x: 0, y: 0 });
    expect(state.pixelRatio).toBe(1.5);
  });

  it('skips the backend resize seam when the pixel extent is unchanged', () => {
    const { resize, view } = makeView();

    resizeRenderView(view, 1, 1, 1, resize);

    expect(resize).not.toHaveBeenCalled();
  });

  it('still reconciles viewport and state for a DPR-only change', () => {
    const { resize, state, target, view, viewport } = makeView();
    target.width = 2;
    target.height = 2;

    resizeRenderView(view, 1, 1, 2, resize);

    expect(resize).not.toHaveBeenCalled();
    expect(viewport).toMatchObject({ devicePixelRatio: 2, height: 2, width: 2, x: 0, y: 0 });
    expect(state.pixelRatio).toBe(2);
  });

  it('rounds fractional dimensions and clamps negative dimensions to zero', () => {
    const { resize, view } = makeView();

    resizeRenderView(view, 4.25, 2.25, 2, resize);
    resizeRenderView(view, -3, -4, 2, resize);

    expect(resize).toHaveBeenNthCalledWith(1, view.renderState, view.renderTarget, 9, 5);
    expect(resize).toHaveBeenNthCalledWith(2, view.renderState, view.renderTarget, 0, 0);
  });
});

function makeComponents(): {
  resize: ReturnType<typeof vi.fn<RenderViewResize>>;
  state: RenderState;
  target: RenderTargetDimensions;
  viewport: Viewport;
} {
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
  const resize = vi.fn<RenderViewResize>(
    (_state: RenderState, resizedTarget: RenderTargetDimensions, width: number, height: number) => {
      resizedTarget.width = width;
      resizedTarget.height = height;
    },
  );
  return { resize, state, target, viewport };
}

function makeView() {
  const { resize, state, target, viewport } = makeComponents();
  const view = createRenderView(state, target, viewport);
  return { resize, state, target, view, viewport };
}
