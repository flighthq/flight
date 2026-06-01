import { createMatrix } from '@flighthq/geometry';
import { setImageCache } from '@flighthq/image-cache';
import {
  getOrCreateDisplayObjectRenderNode,
  registerRenderer,
  updateDisplayObjectBeforeRender,
} from '@flighthq/render-core';
import { addGraphChild } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import type { WebGLRenderState } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { renderWebGLDisplayObject } from './webglDisplayObject';
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

describe('renderWebGLDisplayObject', () => {
  it('does not throw for an empty display object', () => {
    const state = makeState();
    const obj = createDisplayObject();
    expect(() => renderWebGLDisplayObject(state, obj)).not.toThrow();
  });

  it('calls renderer.draw for a visible object with a registered renderer', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D = createMatrix();
    data.renderer = renderer;

    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).toHaveBeenCalledWith(state, data);
  });

  it('skips objects with visible set to false', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = false;
    data.renderer = renderer;

    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('skips objects with alpha at or below 0', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 0;
    data.renderer = renderer;

    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('skips objects with degenerate transform (a=0 and d=0)', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const obj = createDisplayObject();
    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D = createMatrix(0, 0, 0, 0);
    data.renderer = renderer;

    renderWebGLDisplayObject(state, obj);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('uses image cache when source is set, skipping renderer.draw', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, DisplayObjectKind, renderer);

    const obj = createDisplayObject();
    const offscreen = document.createElement('canvas');
    offscreen.width = 32;
    offscreen.height = 32;
    const imageSource = { src: offscreen, width: 32, height: 32, version: 0 } as any;
    setImageCache(obj, { source: imageSource, transform: createMatrix() });

    updateDisplayObjectBeforeRender(state, obj);
    expect(() => renderWebGLDisplayObject(state, obj)).not.toThrow();
    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('recurses into children and renders them', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const parent = createDisplayObject();
    const child = createDisplayObject();
    addGraphChild(parent, child);

    const parentData = getOrCreateDisplayObjectRenderNode(state, parent);
    parentData.visible = true;
    parentData.alpha = 1;
    parentData.transform2D = createMatrix();
    parentData.renderer = null;

    const childData = getOrCreateDisplayObjectRenderNode(state, child);
    childData.visible = true;
    childData.alpha = 1;
    childData.transform2D = createMatrix();
    childData.renderer = renderer;

    renderWebGLDisplayObject(state, parent);

    expect(renderer.draw).toHaveBeenCalledWith(state, childData);
  });
});
