import { addTextureAtlasRegion, createImageSourceFromCanvas, createTextureAtlas } from '@flighthq/assets';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateSpriteRenderNode } from '@flighthq/render';
import { createSprite } from '@flighthq/scene-sprite';
import { SpriteKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMSpriteRenderer, drawDOMSprite, renderDOMSprite } from './domSprite';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, SpriteKind, defaultDOMSpriteRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

function makeAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const image = createImageSourceFromCanvas(canvas);
  const atlas = createTextureAtlas({ image });
  addTextureAtlasRegion(atlas, 0, 0, 32, 32);
  return atlas;
}

describe('defaultDOMSpriteRenderer', () => {
  it('has draw and createData', () => {
    expect(typeof defaultDOMSpriteRenderer.draw).toBe('function');
    expect(typeof defaultDOMSpriteRenderer.createData).toBe('function');
  });
});

describe('drawDOMSprite', () => {
  it('does nothing when atlas is null', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = null;
    const renderNode = getOrCreateSpriteRenderNode(state, sprite);

    const el = drawGetEl(state, () => drawDOMSprite(state, renderNode));

    expect(el).toBeNull();
  });

  it('does nothing when atlas image is null', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = createTextureAtlas({ image: null });
    sprite.data.atlas.regions.push({ x: 0, y: 0, width: 32, height: 32 } as any);
    const renderNode = getOrCreateSpriteRenderNode(state, sprite);

    const el = drawGetEl(state, () => drawDOMSprite(state, renderNode));

    expect(el).toBeNull();
  });

  it('does nothing when rendererData is null', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = makeAtlas();
    sprite.data.id = 0;
    const renderNode = getOrCreateSpriteRenderNode(state, sprite);
    renderNode.rendererData = null;

    const el = drawGetEl(state, () => drawDOMSprite(state, renderNode));

    expect(el).toBeNull();
  });

  it('produces a canvas when atlas and image are valid', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = makeAtlas();
    sprite.data.id = 0;
    const renderNode = getOrCreateSpriteRenderNode(state, sprite);

    const el = drawGetEl(state, () => drawDOMSprite(state, renderNode));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('CANVAS');
  });

  it('does nothing when region has zero size', () => {
    const state = makeState();
    const canvas = document.createElement('canvas');
    const image = createImageSourceFromCanvas(canvas);
    const atlas = createTextureAtlas({ image });
    addTextureAtlasRegion(atlas, 0, 0, 0, 0);
    const sprite = createSprite();
    sprite.data.atlas = atlas;
    sprite.data.id = 0;
    const renderNode = getOrCreateSpriteRenderNode(state, sprite);

    const el = drawGetEl(state, () => drawDOMSprite(state, renderNode));

    expect(el).toBeNull();
  });
});

describe('renderDOMSprite', () => {
  it('removes foreign elements from the container on first render', () => {
    const state = makeState();
    const foreign = document.createElement('span');
    state.element.appendChild(foreign);
    const sprite = createSprite();

    renderDOMSprite(state, sprite);

    expect(state.element.contains(foreign)).toBe(false);
  });

  it('does not throw for an empty sprite tree', () => {
    const state = makeState();
    const sprite = createSprite();
    expect(() => renderDOMSprite(state, sprite)).not.toThrow();
  });
});
