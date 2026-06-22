import { createRenderView } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render';
import type { RenderViewRenderer } from '@flighthq/types';
import { RenderViewKind } from '@flighthq/types';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { defaultDomRenderViewRenderer, drawDomRenderView } from './domRenderView';

function makeState() {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  registerRenderer(state, RenderViewKind, defaultDomRenderViewRenderer);
  return state;
}

function makeRenderer(width = 100, height = 100): RenderViewRenderer {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = width;
  canvas.height = height;
  return { canvas, render: () => {} };
}

function getElement(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('drawDomRenderView', () => {
  it('returns no element when renderer is null', () => {
    const state = makeState();
    const view = createRenderView();
    const renderProxy = getOrCreateRenderProxy2D(state, view);
    const el = getElement(state, () => drawDomRenderView(state, renderProxy));
    expect(el).toBeNull();
  });

  it('calls render() on the renderer', () => {
    const state = makeState();
    const renderer = makeRenderer();
    const renderSpy = vi.spyOn(renderer, 'render');
    const view = createRenderView({ data: { renderer, width: 100, height: 100 } });
    const renderProxy = getOrCreateRenderProxy2D(state, view);
    drawDomRenderView(state, renderProxy);
    expect(renderSpy).toHaveBeenCalledOnce();
  });

  it('returns the renderer canvas as the DOM element', () => {
    const state = makeState();
    const renderer = makeRenderer();
    const view = createRenderView({ data: { renderer, width: 100, height: 100 } });
    const renderProxy = getOrCreateRenderProxy2D(state, view);
    const el = getElement(state, () => drawDomRenderView(state, renderProxy));
    expect(el).toBe(renderer.canvas);
  });

  it('initializes canvas positioning on first draw', () => {
    const state = makeState();
    const renderer = makeRenderer();
    const view = createRenderView({ data: { renderer, width: 100, height: 100 } });
    const renderProxy = getOrCreateRenderProxy2D(state, view);
    drawDomRenderView(state, renderProxy);
    expect(renderer.canvas.style.position).toBe('absolute');
    expect(renderer.canvas.style.transformOrigin).toBe('0 0');
    expect(renderer.canvas.style.pointerEvents).toBe('none');
  });
});
