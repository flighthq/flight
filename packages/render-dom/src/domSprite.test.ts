import { addTextureAtlasRegion, createImageSourceFromCanvas, createTextureAtlas } from '@flighthq/assets';
import { getSpriteRenderNode, registerRenderer } from '@flighthq/render-core';
import { createSprite } from '@flighthq/scenegraph-sprite';
import { SpriteKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMSpriteRenderer, drawDOMSprite, renderDOMSprite } from './domSprite';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, SpriteKind, defaultDOMSpriteRenderer);
  return state;
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

describe('drawDOMSprite', () => {
  it('does nothing when atlas is null', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = null;
    const renderNode = getSpriteRenderNode(state, sprite);

    drawDOMSprite(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('does nothing when atlas image is null', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = createTextureAtlas({ image: null });
    sprite.data.atlas.regions.push({ x: 0, y: 0, width: 32, height: 32 } as any);
    const renderNode = getSpriteRenderNode(state, sprite);

    drawDOMSprite(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('does nothing when rendererData is null', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = makeAtlas();
    sprite.data.id = 0;
    const renderNode = getSpriteRenderNode(state, sprite);
    renderNode.rendererData = null;

    drawDOMSprite(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends a canvas when atlas and image are valid', () => {
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = makeAtlas();
    sprite.data.id = 0;
    const renderNode = getSpriteRenderNode(state, sprite);

    drawDOMSprite(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('CANVAS');
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
    const renderNode = getSpriteRenderNode(state, sprite);

    drawDOMSprite(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });
});

describe('renderDOMSprite', () => {
  it('clears the container before rendering', () => {
    const state = makeState();
    const child = document.createElement('span');
    state.element.appendChild(child);
    const sprite = createSprite();

    renderDOMSprite(state, sprite);

    expect(state.element.contains(child)).toBe(false);
  });

  it('does not throw for an empty sprite tree', () => {
    const state = makeState();
    const sprite = createSprite();
    expect(() => renderDOMSprite(state, sprite)).not.toThrow();
  });
});

describe('defaultDOMSpriteRenderer', () => {
  it('has draw and createData', () => {
    expect(typeof defaultDOMSpriteRenderer.draw).toBe('function');
    expect(typeof defaultDOMSpriteRenderer.createData).toBe('function');
  });
});
