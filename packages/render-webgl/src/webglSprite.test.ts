import { addNodeChild } from '@flighthq/node';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender, registerRenderer } from '@flighthq/render';
import { createSprite } from '@flighthq/sprite';
import { SpriteKind } from '@flighthq/types';

import { renderWebGLSprite } from './webglSprite';
import { makeWebGLState } from './webglTestHelper';

function makeRenderer() {
  return { createData: () => null, submit: vi.fn() } as any;
}

describe('renderWebGLSprite', () => {
  it('does not throw for an empty sprite node', () => {
    const { state } = makeWebGLState();
    const sprite = createSprite();
    expect(() => {
      prepareDisplayObjectRender(state, sprite);
      renderWebGLSprite(state, sprite);
    }).not.toThrow();
  });

  it('calls renderer.submit for a visible sprite with a registered renderer', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    const data = getOrCreateRenderProxy2D(state, sprite);

    prepareDisplayObjectRender(state, sprite);
    renderWebGLSprite(state, sprite);

    expect(renderer.submit).toHaveBeenCalledWith(state, data);
  });

  it('skips a sprite node with visible set to false', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    sprite.visible = false;

    prepareDisplayObjectRender(state, sprite);
    renderWebGLSprite(state, sprite);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('skips a sprite node with alpha at or below 0', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    sprite.alpha = 0;

    prepareDisplayObjectRender(state, sprite);
    renderWebGLSprite(state, sprite);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('recurses into children and renders visible ones', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const parent = createSprite();
    const child = createSprite();
    addNodeChild(parent, child);

    prepareDisplayObjectRender(state, parent);
    renderWebGLSprite(state, parent);

    expect(renderer.submit).toHaveBeenCalledTimes(2);
  });
});
