import { createMatrix } from '@flighthq/geometry';
import {
  enableRenderFeatures,
  getOrCreateDisplayObjectRenderNode,
  registerDisplayObjectMaskRenderer,
  registerRenderer,
} from '@flighthq/render';
import { addSceneChild } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import type { WebGLRenderState } from '@flighthq/types';
import { DisplayObjectKind, RenderFeatures } from '@flighthq/types';

import {
  defaultWebGLDisplayObjectRenderer,
  drawWebGLDisplayObject,
  drawWebGLDisplayObjectMask,
} from './webglDisplayObject';
import { enableWebGLMaskSupport } from './webglMask';
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
    addSceneChild(parent, child);
    const childData = getOrCreateDisplayObjectRenderNode(state, child);

    drawWebGLDisplayObjectMask(state, getOrCreateDisplayObjectRenderNode(state, parent));

    expect(renderer.drawMask).toHaveBeenCalledWith(state, childData);
  });
});
