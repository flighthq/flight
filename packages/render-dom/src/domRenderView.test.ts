import { getOrCreateDisplayObjectRenderNode, registerRenderer } from '@flighthq/render';
import { createRenderView } from '@flighthq/scene-display';
import type { RenderViewRenderer } from '@flighthq/types';
import { RenderViewKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMRenderViewRenderer, drawDOMRenderView } from './domRenderView';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, RenderViewKind, defaultDOMRenderViewRenderer);
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
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

describe('drawDOMRenderView', () => {
  it('returns no element when renderer is null', () => {
    const state = makeState();
    const view = createRenderView();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, view);
    const el = getElement(state, () => drawDOMRenderView(state, renderNode));
    expect(el).toBeNull();
  });

  it('calls render() on the renderer', () => {
    const state = makeState();
    const renderer = makeRenderer();
    const renderSpy = vi.spyOn(renderer, 'render');
    const view = createRenderView({ data: { renderer, width: 100, height: 100 } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, view);
    drawDOMRenderView(state, renderNode);
    expect(renderSpy).toHaveBeenCalledOnce();
  });

  it('returns the renderer canvas as the DOM element', () => {
    const state = makeState();
    const renderer = makeRenderer();
    const view = createRenderView({ data: { renderer, width: 100, height: 100 } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, view);
    const el = getElement(state, () => drawDOMRenderView(state, renderNode));
    expect(el).toBe(renderer.canvas);
  });

  it('initializes canvas positioning on first draw', () => {
    const state = makeState();
    const renderer = makeRenderer();
    const view = createRenderView({ data: { renderer, width: 100, height: 100 } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, view);
    drawDOMRenderView(state, renderNode);
    expect(renderer.canvas.style.position).toBe('absolute');
    expect(renderer.canvas.style.transformOrigin).toBe('0 0');
    expect(renderer.canvas.style.pointerEvents).toBe('none');
  });
});
