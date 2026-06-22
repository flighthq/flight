import { createHtmlView } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { HtmlViewKind } from '@flighthq/types';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { defaultHtmlViewRenderer, drawDomHtmlView } from './htmlView';

function makeState() {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  registerRenderer(state, HtmlViewKind, defaultHtmlViewRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('defaultHtmlViewRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultHtmlViewRenderer.submit).toBe('function');
    expect(typeof defaultHtmlViewRenderer.createData).toBe('function');
  });
});

describe('drawDomHtmlView', () => {
  it('produces no element when source element is null', () => {
    const state = makeState();
    const node = createHtmlView();
    node.data.element = null;
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDomHtmlView(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces the source element', () => {
    const state = makeState();
    const inner = document.createElement('span');
    const node = createHtmlView({ data: { element: inner } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDomHtmlView(state, renderProxy));

    expect(el).toBe(inner);
  });

  it('initializes position and overflow styles on first draw', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHtmlView({ data: { element: inner } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    drawDomHtmlView(state, renderProxy);

    expect(inner.style.position).toBe('absolute');
    expect(inner.style.left).toBe('0px');
    expect(inner.style.top).toBe('0px');
    expect(inner.style.transformOrigin).toBe('0 0');
    expect(inner.style.overflow).toBe('hidden');
  });

  it('does not reset position styles on subsequent draws when already absolute', () => {
    const state = makeState();
    const inner = document.createElement('div');
    inner.style.position = 'absolute';
    inner.style.left = '50px';
    const node = createHtmlView({ data: { element: inner } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    drawDomHtmlView(state, renderProxy);

    expect(inner.style.left).toBe('50px');
  });

  it('applies width and height from data', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHtmlView({ data: { element: inner, width: 320, height: 240 } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    drawDomHtmlView(state, renderProxy);

    expect(inner.style.width).toBe('320px');
    expect(inner.style.height).toBe('240px');
  });

  it('updates width and height when data changes between draws', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHtmlView({ data: { element: inner, width: 100, height: 100 } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    drawDomHtmlView(state, renderProxy);
    node.data.width = 640;
    node.data.height = 480;
    drawDomHtmlView(state, renderProxy);

    expect(inner.style.width).toBe('640px');
    expect(inner.style.height).toBe('480px');
  });

  it('applies transform from the render node', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHtmlView({ data: { element: inner } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    drawDomHtmlView(state, renderProxy);

    expect(inner.style.transform).toMatch(/^matrix\(/);
  });
});
