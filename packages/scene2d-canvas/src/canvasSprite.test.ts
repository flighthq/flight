import { createImageResource } from '@flighthq/image';
import { addNodeChild } from '@flighthq/node';
import { getOrCreateRenderProxy2D, prepareScene2DRender, registerRenderer } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/sprite';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import { SpriteKind } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasRenderState';
import { defaultCanvasSpriteRenderer, drawCanvasSprite, renderCanvasSprite } from './canvasSprite';

function makeAtlas() {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageResource(img);
  const atlas = createTextureAtlas({ image: source });
  addTextureAtlasRegion(atlas, 0, 0, 32, 32);
  return atlas;
}

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 400;
  const state = createCanvasRenderState(canvas, { imageSmoothingEnabled: false });
  registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);
  return state;
}

describe('drawCanvasSprite', () => {
  it('calls drawImage when sprite has a valid atlas region', () => {
    const atlas = makeAtlas();
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = atlas;
    sprite.data.id = 0;
    prepareScene2DRender(state, sprite);
    const renderProxy = getOrCreateRenderProxy2D(state, sprite);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasSprite(state, renderProxy);
    expect(spy).toHaveBeenCalled();
  });

  it('skips draw when atlas is null', () => {
    const state = makeState();
    const sprite = createSprite();
    prepareScene2DRender(state, sprite);
    const renderProxy = getOrCreateRenderProxy2D(state, sprite);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasSprite(state, renderProxy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws a pivoted atlas region around the sprite origin', () => {
    const atlas = makeAtlas();
    atlas.regions[0].pivotX = 7;
    atlas.regions[0].pivotY = 9;
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = atlas;
    prepareScene2DRender(state, sprite);
    const renderProxy = getOrCreateRenderProxy2D(state, sprite);
    const spy = vi.spyOn(state.context, 'drawImage');

    drawCanvasSprite(state, renderProxy);

    expect(spy.mock.calls[0].slice(5, 7)).toEqual([-7, -9]);
  });
});

describe('renderCanvasSprite', () => {
  it('does not throw for an empty sprite', () => {
    const state = makeState();
    const sprite = createSprite();
    prepareScene2DRender(state, sprite);
    expect(() => renderCanvasSprite(state, sprite)).not.toThrow();
  });

  it('calls renderer.submit for a visible sprite with a renderer', () => {
    const atlas = makeAtlas();
    const state = makeState();
    const sprite = createSprite();
    sprite.data.atlas = atlas;
    sprite.data.id = 0;
    prepareScene2DRender(state, sprite);
    const spy = vi.spyOn(state.context, 'drawImage');

    renderCanvasSprite(state, sprite);

    expect(spy).toHaveBeenCalled();
  });

  it('traverses children and draws them', () => {
    const atlas = makeAtlas();
    const state = makeState();
    const parent = createSprite();
    const child = createSprite();
    child.data.atlas = atlas;
    child.data.id = 0;
    addNodeChild(parent, child);
    prepareScene2DRender(state, parent);
    const spy = vi.spyOn(state.context, 'drawImage');

    renderCanvasSprite(state, parent);

    expect(spy).toHaveBeenCalledOnce();
  });
});
