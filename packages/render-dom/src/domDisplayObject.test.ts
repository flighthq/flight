import { getOrCreateDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { addGraphChild } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import { DisplayObjectKind } from '@flighthq/types';

import { renderDOMDisplayObject } from './domDisplayObject';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  const container = document.createElement('div');
  return createDOMRenderState(container);
}

describe('renderDOMDisplayObject', () => {
  it('does not throw for a simple visible object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    expect(() => renderDOMDisplayObject(state, obj)).not.toThrow();
  });

  it('clears the container before rendering', () => {
    const state = makeState();
    const child = document.createElement('span');
    state.element.appendChild(child);

    const obj = createDisplayObject();
    renderDOMDisplayObject(state, obj);

    expect(state.element.contains(child)).toBe(false);
  });

  it('skips rendering when the object has zero scale', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    // Zero a and d means zero scale — should not render
    data.transform2D.a = 0;
    data.transform2D.d = 0;

    const renderer = { draw: vi.fn(), drawMask: vi.fn(), createData: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    data.renderer = renderer;

    renderDOMDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('skips rendering invisible objects', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = false;

    const renderer = { draw: vi.fn(), drawMask: vi.fn(), createData: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    data.renderer = renderer;

    renderDOMDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('skips objects with zero alpha', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.alpha = 0;

    const renderer = { draw: vi.fn(), drawMask: vi.fn(), createData: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    data.renderer = renderer;

    renderDOMDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('calls draw when the object is visible and has a renderer', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D.a = 1;
    data.transform2D.d = 1;

    const renderer = { draw: vi.fn(), drawMask: vi.fn(), createData: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    data.renderer = renderer;

    renderDOMDisplayObject(state, obj);

    expect(renderer.draw).toHaveBeenCalledOnce();
  });

  it('traverses children', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addGraphChild(parent, child);

    const childData = getOrCreateDisplayObjectRenderNode(state, child);
    childData.visible = true;
    childData.alpha = 1;
    childData.transform2D.a = 1;
    childData.transform2D.d = 1;

    const renderer = { draw: vi.fn(), drawMask: vi.fn(), createData: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    childData.renderer = renderer;

    renderDOMDisplayObject(state, parent);

    // Both parent and child are DisplayObjectKind and get the registered renderer
    expect(renderer.draw).toHaveBeenCalledTimes(2);
  });
});
