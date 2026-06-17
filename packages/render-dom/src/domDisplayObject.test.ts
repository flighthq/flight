import { appendShapeRectangle, createDisplayObject, createShape } from '@flighthq/displayobject';
import { createRectangle } from '@flighthq/geometry';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import { getOrCreateRenderNode2D, prepareDisplayObjectRender, registerRenderer } from '@flighthq/render';
import { DisplayObjectKind } from '@flighthq/types';

import { enableDOMClipRectangleSupport, enableDOMMaskSupport } from './domClip';
import { renderDOMDisplayObject } from './domDisplayObject';
import { createDOMRenderState } from './domRenderState';

type ManagedState = ReturnType<typeof makeState> & { domCurrentElement: HTMLElement | null };

function makeState() {
  const container = document.createElement('div');
  return createDOMRenderState(container);
}

// Sets up a node with a mock renderer that registers a specific element without going
// through registerRenderer (which would change rendererMapID and overwrite other nodes).
function setupRenderedNode(
  state: ReturnType<typeof makeState>,
  obj: ReturnType<typeof createDisplayObject>,
  el: HTMLElement,
) {
  const data = getOrCreateRenderNode2D(state, obj);
  data.visible = true;
  data.alpha = 1;
  data.transform2D.a = 1;
  data.transform2D.d = 1;
  data.renderer = {
    createData: vi.fn(),
    submit: vi.fn().mockImplementation(() => {
      (state as ManagedState).domCurrentElement = el;
    }),
  };
  data.rendererMapID = state.rendererMapID;
  return data;
}

describe('renderDOMDisplayObject', () => {
  it('does not throw for a simple visible object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    expect(() => renderDOMDisplayObject(state, obj)).not.toThrow();
  });

  it('removes foreign elements from the container on first render', () => {
    const state = makeState();
    const foreign = document.createElement('span');
    state.element.appendChild(foreign);

    const obj = createDisplayObject();
    renderDOMDisplayObject(state, obj);

    expect(state.element.contains(foreign)).toBe(false);
  });

  it('skips rendering when the object has zero scale', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.scaleX = 0;
    obj.scaleY = 0;
    invalidateNodeLocalTransform(obj);

    const renderer = { createData: vi.fn(), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, obj);
    renderDOMDisplayObject(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('skips rendering invisible objects', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.visible = false;

    const renderer = { createData: vi.fn(), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, obj);
    renderDOMDisplayObject(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('skips objects with zero alpha', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.alpha = 0;

    const renderer = { createData: vi.fn(), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareDisplayObjectRender(state, obj);
    renderDOMDisplayObject(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('calls draw when the object is visible and has a renderer', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const el = document.createElement('div');
    const data = setupRenderedNode(state, obj, el);

    renderDOMDisplayObject(state, obj);

    expect(data.renderer!.submit).toHaveBeenCalledOnce();
  });

  it('traverses children', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);

    const childEl = document.createElement('div');
    const childData = setupRenderedNode(state, child, childEl);

    prepareDisplayObjectRender(state, parent);
    renderDOMDisplayObject(state, parent);

    expect(childData.renderer!.submit).toHaveBeenCalled();
  });

  it('skips draw on fully static nodes after first render', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const el = document.createElement('div');
    const data = setupRenderedNode(state, obj, el);

    // First render: node is new, draw must be called.
    renderDOMDisplayObject(state, obj);
    expect(data.renderer!.submit).toHaveBeenCalledTimes(1);

    // Second render: nothing changed, draw should be skipped.
    renderDOMDisplayObject(state, obj);
    expect(data.renderer!.submit).toHaveBeenCalledTimes(1);
  });

  it('places rendered elements in scene-graph order', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const childA = createDisplayObject();
    const childB = createDisplayObject();
    addNodeChild(parent, childA);
    addNodeChild(parent, childB);

    const elA = document.createElement('div');
    const elB = document.createElement('span');
    setupRenderedNode(state, childA, elA);
    setupRenderedNode(state, childB, elB);

    prepareDisplayObjectRender(state, parent);
    renderDOMDisplayObject(state, parent);

    const children = Array.from(state.element.children);
    expect(children.indexOf(elA)).toBeLessThan(children.indexOf(elB));
  });

  it('reconciles DOM when a child is removed', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const childA = createDisplayObject();
    const childB = createDisplayObject();
    addNodeChild(parent, childA);
    addNodeChild(parent, childB);

    const elA = document.createElement('div');
    const elB = document.createElement('span');
    setupRenderedNode(state, childA, elA);
    const dataB = setupRenderedNode(state, childB, elB);

    prepareDisplayObjectRender(state, parent);
    renderDOMDisplayObject(state, parent);
    expect(state.element.children.length).toBe(2);

    dataB.visible = false;

    renderDOMDisplayObject(state, parent);

    expect(state.element.contains(elA)).toBe(true);
    expect(state.element.contains(elB)).toBe(false);
  });

  it('applies inherited clipRectangle clipping to child elements', () => {
    const state = makeState();
    enableDOMClipRectangleSupport(state);
    const parent = createDisplayObject();
    parent.clipRectangle = createRectangle(10, 20, 30, 40);
    const child = createDisplayObject();
    addNodeChild(parent, child);

    prepareDisplayObjectRender(state, parent);
    const el = document.createElement('div');
    setupRenderedNode(state, child, el);

    renderDOMDisplayObject(state, parent);

    expect(el.style.clipPath).toBe('polygon(10px 20px, 40px 20px, 40px 60px, 10px 60px)');
  });

  it('applies mask bounds clipping to masked elements', () => {
    const state = makeState();
    enableDOMMaskSupport(state);
    const obj = createDisplayObject();
    const mask = createShape();
    appendShapeRectangle(mask, 5, 6, 20, 30);
    obj.mask = mask;

    const el = document.createElement('div');
    setupRenderedNode(state, obj, el);

    prepareDisplayObjectRender(state, obj);
    renderDOMDisplayObject(state, obj);

    expect(el.style.clipPath).toBe('polygon(5px 6px, 25px 6px, 25px 36px, 5px 36px)');
  });
});
