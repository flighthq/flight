import { createMatrix } from '@flighthq/geometry';
import { enableRenderFeatures, registerRenderer } from '@flighthq/render-core';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render-tree';
import { addSceneChild } from '@flighthq/scene-core';
import { createDisplayObject } from '@flighthq/scene-display';
import type { WebGLRenderState } from '@flighthq/types';
import { DisplayObjectKind, RenderFeatures } from '@flighthq/types';

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
  it('has draw, drawMask, and createData functions', () => {
    expect(defaultWebGLDisplayObjectRenderer.createData({} as any, {} as any)).toBeNull();
    expect(defaultWebGLDisplayObjectRenderer.draw).toBe(drawWebGLDisplayObject);
    expect(defaultWebGLDisplayObjectRenderer.drawMask).toBe(drawWebGLDisplayObjectMask);
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
    addSceneChild(parent, child);
    const childData = getOrCreateDisplayObjectRenderNode(state, child);
    childData.renderer = renderer;

    drawWebGLDisplayObjectMask(state, getOrCreateDisplayObjectRenderNode(state, parent));

    expect(renderer.drawMask).toHaveBeenCalledWith(state, childData);
  });
});

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

  it('recurses into children and renders them', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const parent = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(parent, child);

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

  it('applies masks around the object subtree', () => {
    const state = makeState();
    enableRenderFeatures(state, RenderFeatures.Masks);
    const renderer = makeRenderer();
    const maskRenderer = makeRenderer();
    const obj = createDisplayObject();
    const mask = createDisplayObject();
    obj.mask = mask;

    const data = getOrCreateDisplayObjectRenderNode(state, obj);
    data.visible = true;
    data.alpha = 1;
    data.transform2D = createMatrix();
    data.renderer = renderer;

    const maskData = getOrCreateDisplayObjectRenderNode(state, mask);
    maskData.visible = true;
    maskData.alpha = 1;
    maskData.transform2D = createMatrix();
    maskData.renderer = maskRenderer;

    renderWebGLDisplayObject(state, obj);

    expect(maskRenderer.drawMask).toHaveBeenCalledWith(state, maskData);
    expect(renderer.draw).toHaveBeenCalledWith(state, data);
  });
});
