import { addNodeChild } from '@flighthq/node/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/sprite/contract';
import { SpriteKind } from '@flighthq/types/contract';

import { renderGlSprite } from './glSprite';
import { createGlState } from './glTestHelper';

function makeRenderer() {
  return { createData: () => null, submit: vi.fn() } as any;
}

describe('renderGlSprite', () => {
  it('does not throw for an empty sprite node', () => {
    const { state } = createGlState();
    const sprite = createSprite();
    expect(() => {
      prepareScene2DRender(state, sprite);
      renderGlSprite(state, sprite);
    }).not.toThrow();
  });

  it('calls renderer.submit for a visible sprite with a registered renderer', () => {
    const { state } = createGlState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    const data = getOrCreateRenderProxy2D(state, sprite);

    prepareScene2DRender(state, sprite);
    renderGlSprite(state, sprite);

    expect(renderer.submit).toHaveBeenCalledWith(state, data);
  });

  it('skips a sprite node with visible set to false', () => {
    const { state } = createGlState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    sprite.visible = false;

    prepareScene2DRender(state, sprite);
    renderGlSprite(state, sprite);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('skips a sprite node with alpha at or below 0', () => {
    const { state } = createGlState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const sprite = createSprite();
    sprite.alpha = 0;

    prepareScene2DRender(state, sprite);
    renderGlSprite(state, sprite);

    expect(renderer.submit).not.toHaveBeenCalled();
  });

  it('recurses into children and renders visible ones', () => {
    const { state } = createGlState();
    const renderer = makeRenderer();
    registerRenderer(state, SpriteKind, renderer);

    const parent = createSprite();
    const child = createSprite();
    addNodeChild(parent, child);

    prepareScene2DRender(state, parent);
    renderGlSprite(state, parent);

    expect(renderer.submit).toHaveBeenCalledTimes(2);
  });
});
