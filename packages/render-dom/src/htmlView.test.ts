import { getOrCreateDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createHTMLView } from '@flighthq/scenegraph-display';
import { HTMLViewKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultHTMLViewRenderer, drawHTMLView, drawHTMLViewMask } from './htmlView';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, HTMLViewKind, defaultHTMLViewRenderer);
  return state;
}

describe('defaultHTMLViewRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultHTMLViewRenderer.draw).toBe('function');
    expect(typeof defaultHTMLViewRenderer.drawMask).toBe('function');
    expect(typeof defaultHTMLViewRenderer.createData).toBe('function');
  });
});

describe('drawHTMLView', () => {
  it('does not append anything when source element is null', () => {
    const state = makeState();
    const node = createHTMLView();
    node.data.element = null;
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    drawHTMLView(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends the source element to the container', () => {
    const state = makeState();
    const inner = document.createElement('span');
    const node = createHTMLView({ data: { element: inner } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    drawHTMLView(state, renderNode);

    expect(state.element.contains(inner)).toBe(true);
  });

  it('initializes position and overflow styles on first draw', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHTMLView({ data: { element: inner } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    drawHTMLView(state, renderNode);

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
    const node = createHTMLView({ data: { element: inner } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    drawHTMLView(state, renderNode);

    expect(inner.style.left).toBe('50px');
  });

  it('applies width and height from data', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHTMLView({ data: { element: inner, width: 320, height: 240 } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    drawHTMLView(state, renderNode);

    expect(inner.style.width).toBe('320px');
    expect(inner.style.height).toBe('240px');
  });

  it('updates width and height when data changes between draws', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHTMLView({ data: { element: inner, width: 100, height: 100 } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    drawHTMLView(state, renderNode);
    node.data.width = 640;
    node.data.height = 480;
    drawHTMLView(state, renderNode);

    expect(inner.style.width).toBe('640px');
    expect(inner.style.height).toBe('480px');
  });

  it('applies transform from the render node', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createHTMLView({ data: { element: inner } });
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    drawHTMLView(state, renderNode);

    expect(inner.style.transform).toMatch(/^matrix\(/);
  });
});

describe('drawHTMLViewMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createHTMLView();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(() => drawHTMLViewMask(state, renderNode)).not.toThrow();
  });
});
