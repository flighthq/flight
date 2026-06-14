import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { addNodeChild } from '@flighthq/node';
import {
  enableRenderFeatures,
  getOrCreateDisplayObjectRenderNode,
  prepareDisplayObjectRender,
  registerDisplayObjectMaskRenderer,
  registerRenderer,
} from '@flighthq/render';
import type { WebGLRenderState } from '@flighthq/types';
import { DisplayObjectKind, RenderFeatures } from '@flighthq/types';

import { enableWebGLMaskSupport } from './webglClip';
import {
  defaultWebGLDisplayObjectRenderer,
  drawWebGLDisplayObject,
  drawWebGLDisplayObjectMask,
  renderWebGLDisplayObject,
} from './webglDisplayObject';
import { createWebGLRenderState } from './webglRenderState';

function makeState(): WebGLRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  return createWebGLRenderState(canvas);
}

function makeRenderer() {
  return {
    createData: () => null,
    draw: vi.fn(),
    drawMask: vi.fn(),
  } as any;
}

describe('defaultWebGLDisplayObjectRenderer', () => {
  it('has draw, and createData functions', () => {
    expect(defaultWebGLDisplayObjectRenderer.createData({} as any, {} as any)).toBeNull();
    expect(defaultWebGLDisplayObjectRenderer.draw).toBe(drawWebGLDisplayObject);
  });
});

describe('drawWebGLDisplayObject', () => {
  it('does not draw plain display object geometry', () => {
    const state = makeState();
    expect(() => drawWebGLDisplayObject(state, {} as any)).not.toThrow();
  });
});

describe('drawWebGLDisplayObjectMask', () => {
  it('applies child mask renderers', () => {
    const state = makeState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    const renderer = makeRenderer();
    registerDisplayObjectMaskRenderer(state, DisplayObjectKind, renderer);
    addNodeChild(parent, child);
    const childData = getOrCreateDisplayObjectRenderNode(state, child);

    drawWebGLDisplayObjectMask(state, getOrCreateDisplayObjectRenderNode(state, parent));

    expect(renderer.drawMask).toHaveBeenCalledWith(state, childData);
  });
});

describe('renderWebGLDisplayObject', () => {
  it('does not throw for an empty display object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    prepareDisplayObjectRender(state, obj);
    expect(() => renderWebGLDisplayObject(state, obj)).not.toThrow();
  });

  it('calls renderer.draw for a visible object with a renderer', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    prepareDisplayObjectRender(state, obj);

    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).toHaveBeenCalledWith(state, data);
  });

  it('skips objects with zero alpha', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const obj = createDisplayObject();
    obj.alpha = 0;
    prepareDisplayObjectRender(state, obj);

    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('traverses children and draws visible ones', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);
    const parent = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(parent, child);
    prepareDisplayObjectRender(state, parent);

    renderWebGLDisplayObject(state, parent);

    expect(renderer.draw).toHaveBeenCalledTimes(2);
  });
});
