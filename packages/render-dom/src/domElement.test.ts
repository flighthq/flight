import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createDOMElement } from '@flighthq/scenegraph-display';
import { DOMElementKind } from '@flighthq/types';

import { defaultDOMElementRenderer, drawDOMElement, drawDOMElementMask } from './domElement';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, DOMElementKind, defaultDOMElementRenderer);
  return state;
}

describe('drawDOMElement', () => {
  it('does not append anything when source element is null', () => {
    const state = makeState();
    const node = createDOMElement();
    node.data.element = null;
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMElement(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends the source element to the container', () => {
    const state = makeState();
    const inner = document.createElement('span');
    const node = createDOMElement({ data: { element: inner } });
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMElement(state, renderNode);

    expect(state.element.contains(inner)).toBe(true);
  });

  it('initializes position styles on first draw', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createDOMElement({ data: { element: inner } });
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMElement(state, renderNode);

    expect(inner.style.position).toBe('absolute');
    expect(inner.style.left).toBe('0px');
    expect(inner.style.top).toBe('0px');
    expect(inner.style.transformOrigin).toBe('0 0');
  });

  it('does not reset styles on subsequent draws when already absolute', () => {
    const state = makeState();
    const inner = document.createElement('div');
    inner.style.position = 'absolute';
    inner.style.left = '50px';
    const node = createDOMElement({ data: { element: inner } });
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMElement(state, renderNode);

    expect(inner.style.left).toBe('50px');
  });

  it('applies transform from the render node', () => {
    const state = makeState();
    const inner = document.createElement('div');
    const node = createDOMElement({ data: { element: inner } });
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMElement(state, renderNode);

    expect(inner.style.transform).toMatch(/^matrix\(/);
  });
});

describe('drawDOMElementMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createDOMElement();
    const renderNode = getDisplayObjectRenderNode(state, node);
    expect(() => drawDOMElementMask(state, renderNode)).not.toThrow();
  });
});

describe('defaultDOMElementRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultDOMElementRenderer.draw).toBe('function');
    expect(typeof defaultDOMElementRenderer.drawMask).toBe('function');
    expect(typeof defaultDOMElementRenderer.createData).toBe('function');
  });
});
