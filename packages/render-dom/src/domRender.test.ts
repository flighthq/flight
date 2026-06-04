import { registerRenderer } from '@flighthq/render';
import { addSceneChild } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';
import { DisplayObjectKind, SpriteKind } from '@flighthq/types';

import { prepareDOMDisplayObjectRender, prepareDOMSpriteRender, renderDOM } from './domRender';
import { createDOMRenderState } from './domRenderState';
import { defaultDOMSpriteRenderer } from './domSprite';

function makeState() {
  const container = document.createElement('div');
  return createDOMRenderState(container);
}

describe('prepareDOMDisplayObjectRender', () => {
  it('does not throw for an empty scene', () => {
    const state = makeState();
    const root = createDisplayObject();
    expect(() => prepareDOMDisplayObjectRender(state, root)).not.toThrow();
  });

  it('traverses children and builds the DOM order list', () => {
    const state = makeState();
    registerRenderer(state, DisplayObjectKind, {
      createData: () => null,
      draw: vi.fn(),
    } as any);
    const root = createDisplayObject();
    const child = createDisplayObject();
    addSceneChild(root, child);
    prepareDOMDisplayObjectRender(state, root);
    expect(state.currentFrameID).toBe(1);
  });
});

describe('prepareDOMSpriteRender', () => {
  it('does not throw for an empty sprite tree', () => {
    const state = makeState();
    const sprite = createSprite();
    expect(() => prepareDOMSpriteRender(state, sprite)).not.toThrow();
  });

  it('traverses children', () => {
    const state = makeState();
    registerRenderer(state, SpriteKind, defaultDOMSpriteRenderer);
    const root = createSprite();
    const child = createSprite();
    addSceneChild(root, child);
    prepareDOMSpriteRender(state, root);
    expect(state.currentFrameID).toBe(1);
  });
});

describe('renderDOM', () => {
  it('does not throw', () => {
    const state = makeState();
    expect(() => renderDOM(state)).not.toThrow();
  });
});
