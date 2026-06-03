import { addTextureAtlasRegion, createImageSourceFromCanvas, createTextureAtlas } from '@flighthq/assets';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateSpriteRenderNode } from '@flighthq/render';
import { createTilemap } from '@flighthq/scene-sprite';
import { TilemapKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMTilemapRenderer, drawDOMTilemap } from './domTilemap';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, TilemapKind, defaultDOMTilemapRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

function makeTileset() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const image = createImageSourceFromCanvas(canvas);
  const atlas = createTextureAtlas({ image });
  addTextureAtlasRegion(atlas, 0, 0, 16, 16);
  return { atlas, tileWidth: 16, tileHeight: 16 } as any;
}

describe('defaultDOMTilemapRenderer', () => {
  it('has draw and createData', () => {
    expect(typeof defaultDOMTilemapRenderer.draw).toBe('function');
    expect(typeof defaultDOMTilemapRenderer.createData).toBe('function');
  });
});

describe('drawDOMTilemap', () => {
  it('does nothing when tileset is null', () => {
    const state = makeState();
    const tilemap = createTilemap();
    tilemap.data.tileset = null;
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);

    const el = drawGetEl(state, () => drawDOMTilemap(state, renderNode));

    expect(el).toBeNull();
  });

  it('does nothing when rows or columns are zero', () => {
    const state = makeState();
    const tilemap = createTilemap();
    tilemap.data.tileset = makeTileset();
    tilemap.data.columns = 0;
    tilemap.data.rows = 0;
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);

    const el = drawGetEl(state, () => drawDOMTilemap(state, renderNode));

    expect(el).toBeNull();
  });

  it('does nothing when rendererData is null', () => {
    const state = makeState();
    const tilemap = createTilemap();
    tilemap.data.tileset = makeTileset();
    tilemap.data.columns = 2;
    tilemap.data.rows = 2;
    tilemap.data.tiles = new Int16Array([0, 0, 0, 0]);
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);
    renderNode.rendererData = null;

    const el = drawGetEl(state, () => drawDOMTilemap(state, renderNode));

    expect(el).toBeNull();
  });

  it('produces a canvas when tileset, rows, and columns are valid', () => {
    const state = makeState();
    const tilemap = createTilemap();
    tilemap.data.tileset = makeTileset();
    tilemap.data.columns = 2;
    tilemap.data.rows = 2;
    tilemap.data.tiles = new Int16Array([0, 0, 0, 0]);
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);

    const el = drawGetEl(state, () => drawDOMTilemap(state, renderNode));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('CANVAS');
  });
});
