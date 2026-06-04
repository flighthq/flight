import { getOrCreateSpriteRenderNode, registerRenderer } from '@flighthq/render';
import { addSceneChild } from '@flighthq/scene';
import { createSprite } from '@flighthq/scene-sprite';
import { SpriteKind } from '@flighthq/types';

import { prepareWebGLSpriteRender, renderWebGL } from './webglRender';
import { makeWebGLState } from './webglTestHelper';

function makeRenderer() {
  return { createData: () => null, draw: vi.fn() } as any;
}

describe('prepareWebGLSpriteRender + renderWebGL', () => {
  it('does not throw for an empty sprite node', () => {
    const { state } = makeWebGLState();
    const sprite = createSprite();
    expect(() => {
      prepareWebGLSpriteRender(state, sprite);
      renderWebGL(state);
    }).not.toThrow();
  });

  it('calls renderer.draw for a visible sprite with a registered renderer', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    const data = getOrCreateSpriteRenderNode(state, sprite);

    prepareWebGLSpriteRender(state, sprite);
    renderWebGL(state);

    expect(renderer.draw).toHaveBeenCalledWith(state, data);
  });

  it('skips a sprite node with visible set to false', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    sprite.visible = false;

    prepareWebGLSpriteRender(state, sprite);
    renderWebGL(state);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('skips a sprite node with alpha at or below 0', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    sprite.alpha = 0;

    prepareWebGLSpriteRender(state, sprite);
    renderWebGL(state);

    expect(renderer.draw).not.toHaveBeenCalled();
  });

  it('recurses into children and renders visible ones', () => {
    const { state } = makeWebGLState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const parent = createSprite();
    const child = createSprite();
    addSceneChild(parent, child);

    prepareWebGLSpriteRender(state, parent);
    renderWebGL(state);

    expect(renderer.draw).toHaveBeenCalledTimes(2);
  });
});
