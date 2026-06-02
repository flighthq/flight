import { addTextureAtlasRegion, createImageSource, createTextureAtlas } from '@flighthq/assets';
import { registerRenderer } from '@flighthq/render';
import { updateSpriteBeforeRender } from '@flighthq/render-tree';
import { getOrCreateSpriteRenderNode } from '@flighthq/render-tree';
import { addSceneChild, setTransformScaleX, setTransformScaleY, setTransformX, setTransformY } from '@flighthq/scene';
import { createSprite } from '@flighthq/scene-sprite';
import { SpriteKind } from '@flighthq/types';

import { createCanvasRenderState } from './canvasRenderState';
import { defaultCanvasSpriteRenderer, drawCanvasSprite, renderCanvasSprite } from './canvasSprite';

function makeAtlas() {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageSource(img);
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
    updateSpriteBeforeRender(state, sprite);
    const renderNode = getOrCreateSpriteRenderNode(state, sprite);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasSprite(state, renderNode);
    expect(spy).toHaveBeenCalled();
  });

  it('skips draw when atlas is null', () => {
    const state = makeState();
    const sprite = createSprite();
    updateSpriteBeforeRender(state, sprite);
    const renderNode = getOrCreateSpriteRenderNode(state, sprite);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasSprite(state, renderNode);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('renderCanvasSprite', () => {
  it('calls setTransform with child world transform scaled by parent', () => {
    const atlas = makeAtlas();
    const state = makeState();

    const root = createSprite();
    setTransformScaleX(root, 4);
    setTransformScaleY(root, 4);

    const child = createSprite();
    child.data.atlas = atlas;
    child.data.id = 0;
    setTransformX(child, 10);
    setTransformY(child, 5);
    addSceneChild(root, child);

    const spy = vi.spyOn(state.context, 'setTransform');

    updateSpriteBeforeRender(state, root);
    renderCanvasSprite(state, root);

    const calls = spy.mock.calls as unknown as [number, number, number, number, number, number][];
    expect(calls.some(([a, , , d, tx, ty]) => a === 4 && d === 4 && tx === 40 && ty === 20)).toBe(true);
  });

  it('calls drawImage with the correct source region', () => {
    const atlas = makeAtlas();
    const state = makeState();

    const sprite = createSprite();
    sprite.data.atlas = atlas;
    sprite.data.id = 0;

    const spy = vi.spyOn(state.context, 'drawImage');

    updateSpriteBeforeRender(state, sprite);
    renderCanvasSprite(state, sprite);

    expect(spy).toHaveBeenCalledOnce();
    const [, sx, sy, sw, sh, dx, dy] = spy.mock.calls[0] as number[];
    expect(sx).toBe(0);
    expect(sy).toBe(0);
    expect(sw).toBe(32);
    expect(sh).toBe(32);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  it('skips draw when sprite has no atlas', () => {
    const state = makeState();
    const sprite = createSprite();

    const spy = vi.spyOn(state.context, 'drawImage');

    updateSpriteBeforeRender(state, sprite);
    renderCanvasSprite(state, sprite);

    expect(spy).not.toHaveBeenCalled();
  });
});
