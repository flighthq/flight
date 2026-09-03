import { createRectangle } from '@flighthq/geometry/contract';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createDisplayObject, setNode2DClip } from '@flighthq/scene2d/contract';
import type { ClipRegion, Rectangle } from '@flighthq/types/contract';
import { DisplayObjectKind, EntityRuntimeKey } from '@flighthq/types/contract';

import { enableDomClipSupport } from './domClip';
import { defaultDomScene2DRenderer, drawDomScene2D, renderDomScene2D } from './domNode2D';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';

function makeRectangleClip(rect: Rectangle): ClipRegion {
  return { [EntityRuntimeKey]: undefined, contours: null, rect, version: 0, winding: 'nonZero' };
}

function makeState() {
  const container = document.createElement('div');
  return createDomRenderState(container);
}

// Sets up a node with a mock renderer that registers a specific element without going
// through registerRenderer (which would change rendererMapId and overwrite other nodes).
function setupRenderedNode(
  state: ReturnType<typeof makeState>,
  obj: ReturnType<typeof createDisplayObject>,
  el: HTMLElement,
) {
  const data = getOrCreateRenderProxy2D(state, obj);
  data.visible = true;
  data.alpha = 1;
  data.transform2D.a = 1;
  data.transform2D.d = 1;
  data.renderer = {
    createData: vi.fn(),
    submit: vi.fn().mockImplementation(() => {
      getDomRenderStateRuntime(state).domCurrentElement = el;
    }),
  };
  data.rendererMapId = getDomRenderStateRuntime(state).rendererMapId;
  return data;
}

describe('defaultDomScene2DRenderer', () => {
  it('exposes a createData and submit function', () => {
    expect(typeof defaultDomScene2DRenderer.createData).toBe('function');
    expect(typeof defaultDomScene2DRenderer.submit).toBe('function');
  });
});

describe('drawDomScene2D', () => {
  it('does not throw for any render proxy', () => {
    const state = makeState();
    const proxy = getOrCreateRenderProxy2D(state, createDisplayObject());
    expect(() => drawDomScene2D(state, proxy)).not.toThrow();
  });
});

describe('renderDomScene2D', () => {
  it('does not throw for a simple visible object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    expect(() => renderDomScene2D(state, obj)).not.toThrow();
  });

  it('removes foreign elements from the container on first render', () => {
    const state = makeState();
    const foreign = document.createElement('span');
    state.element.appendChild(foreign);

    const obj = createDisplayObject();
    renderDomScene2D(state, obj);

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
    prepareScene2DRender(state, obj);
    renderDomScene2D(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('skips rendering invisible objects', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.visible = false;

    const renderer = { createData: vi.fn(), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareScene2DRender(state, obj);
    renderDomScene2D(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('skips objects with zero alpha', () => {
    const state = makeState();
    const obj = createDisplayObject();
    obj.alpha = 0;

    const renderer = { createData: vi.fn(), submit: vi.fn() };
    registerRenderer(state, DisplayObjectKind, renderer);
    prepareScene2DRender(state, obj);
    renderDomScene2D(state, obj);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('calls draw when the object is visible and has a renderer', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const el = document.createElement('div');
    const data = setupRenderedNode(state, obj, el);

    renderDomScene2D(state, obj);

    expect(data.renderer!.submit).toHaveBeenCalledOnce();
  });

  it('traverses children', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);

    const childEl = document.createElement('div');
    const childData = setupRenderedNode(state, child, childEl);

    prepareScene2DRender(state, parent);
    renderDomScene2D(state, parent);

    expect(childData.renderer!.submit).toHaveBeenCalled();
  });

  it('skips draw on fully static nodes after first render', () => {
    const state = makeState();
    const obj = createDisplayObject();
    const el = document.createElement('div');
    const data = setupRenderedNode(state, obj, el);

    // First render: node is new, draw must be called.
    renderDomScene2D(state, obj);
    expect(data.renderer!.submit).toHaveBeenCalledTimes(1);

    // Second render: nothing changed, draw should be skipped.
    renderDomScene2D(state, obj);
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

    prepareScene2DRender(state, parent);
    renderDomScene2D(state, parent);

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

    prepareScene2DRender(state, parent);
    renderDomScene2D(state, parent);
    expect(state.element.children.length).toBe(2);

    dataB.visible = false;

    renderDomScene2D(state, parent);

    expect(state.element.contains(elA)).toBe(true);
    expect(state.element.contains(elB)).toBe(false);
  });

  it('applies an inherited rectangle clip to child elements', () => {
    const state = makeState();
    enableDomClipSupport(state);
    const parent = createDisplayObject();
    setNode2DClip(parent, makeRectangleClip(createRectangle(10, 20, 30, 40)));
    const child = createDisplayObject();
    addNodeChild(parent, child);

    prepareScene2DRender(state, parent);
    const el = document.createElement('div');
    setupRenderedNode(state, child, el);

    renderDomScene2D(state, parent);

    expect(el.style.clipPath).toBe('polygon(10px 20px, 40px 20px, 40px 60px, 10px 60px)');
  });

  it('applies a rectangle clip set directly on the clipping node to its content', () => {
    const state = makeState();
    enableDomClipSupport(state);
    const parent = createDisplayObject();
    setNode2DClip(parent, makeRectangleClip(createRectangle(5, 6, 20, 30)));
    const content = createDisplayObject();
    addNodeChild(parent, content);

    const el = document.createElement('div');
    setupRenderedNode(state, content, el);

    prepareScene2DRender(state, parent);
    renderDomScene2D(state, parent);

    expect(el.style.clipPath).toBe('polygon(5px 6px, 25px 6px, 25px 36px, 5px 36px)');
  });
});
