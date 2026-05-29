import { getSpriteRenderNode, registerRenderer } from '@flighthq/render-core';
import { addChild } from '@flighthq/scenegraph-core';
import { createSprite } from '@flighthq/scenegraph-sprite';
import type { SpriteRenderer, WebGLRenderState } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import { renderWebGLSprite } from './webglSprite';
import { createWebGLRenderState } from './webglRenderState';

function makeState(): WebGLRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  return createWebGLRenderState(canvas);
}

function makeRenderer(): SpriteRenderer & { draw: ReturnType<typeof vi.fn> } {
  return {
    createData: () => null,
    draw: vi.fn(),
  };
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
    const data = getSpriteRenderNode(state, sprite);
    data.visible = true;
    data.alpha = 1;
    data.transform2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    data.renderer = renderer;

    renderWebGLSprite(state, sprite);

    expect(renderer.draw).toHaveBeenCalledWith(state, data);
  });

  it('skips a sprite node with visible set to false', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const sprite = createSprite();
    const data = getSpriteRenderNode(state, sprite);
    data.visible = false;
    data.renderer = renderer;

    renderWebGLSprite(state, sprite);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('skips a sprite node with alpha at or below 0', () => {
    const state = makeState();
    const renderer = makeRenderer();

    const sprite = createSprite();
    const data = getSpriteRenderNode(state, sprite);
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
    addChild(parent, child);

    const parentData = getSpriteRenderNode(state, parent);
    parentData.visible = true;
    parentData.alpha = 1;
    parentData.transform2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    parentData.renderer = null;

    const childData = getSpriteRenderNode(state, child);
    childData.visible = true;
    childData.alpha = 1;
    childData.transform2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    childData.renderer = renderer;

    renderWebGLSprite(state, parent);

    expect(renderer.draw).toHaveBeenCalledWith(state, childData);
  });
});
