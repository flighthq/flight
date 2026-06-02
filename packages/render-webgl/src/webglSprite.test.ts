import { createMatrix } from '@flighthq/geometry';
import { registerRenderer } from '@flighthq/render-core';
import { getOrCreateSpriteRenderNode } from '@flighthq/render-tree';
import { addSceneChild } from '@flighthq/scene-core';
import { createSprite } from '@flighthq/scene-sprite';
import type { WebGLRenderState } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import { createWebGLRenderState } from './webglRenderState';
import { renderWebGLSprite } from './webglSprite';

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
  } as any;
}

describe('renderWebGLSprite', () => {
  it('does not throw for an empty sprite node', () => {
    const state = makeState();
    const sprite = createSprite();
    expect(() => renderWebGLSprite(state, sprite)).not.toThrow();
  });

  it('calls renderer.draw for a visible sprite with a registered renderer', () => {
    const state = makeState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    const data = getOrCreateSpriteRenderNode(state, sprite);
    data.visible = true;
    data.alpha = 1;
    data.transform2D = createMatrix();
    data.renderer = renderer;

    renderWebGLSprite(state, sprite);

    expect(renderer.draw).toHaveBeenCalledWith(state, data);
  });

  it('skips a sprite node with visible set to false', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const sprite = createSprite();
    const data = getOrCreateSpriteRenderNode(state, sprite);
    data.visible = false;
    data.renderer = renderer;

    renderWebGLSprite(state, sprite);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('skips a sprite node with alpha at or below 0', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const sprite = createSprite();
    const data = getOrCreateSpriteRenderNode(state, sprite);
    data.visible = true;
    data.alpha = 0;
    data.renderer = renderer;

    renderWebGLSprite(state, sprite);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('recurses into children and renders visible ones', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const parent = createSprite();
    const child = createSprite();
    addSceneChild(parent, child);

    const parentData = getOrCreateSpriteRenderNode(state, parent);
    parentData.visible = true;
    parentData.alpha = 1;
    parentData.transform2D = createMatrix();
    parentData.renderer = null;

    const childData = getOrCreateSpriteRenderNode(state, child);
    childData.visible = true;
    childData.alpha = 1;
    childData.transform2D = createMatrix();
    childData.renderer = renderer;

    renderWebGLSprite(state, parent);

    expect(renderer.draw).toHaveBeenCalledWith(state, childData);
  });
});
