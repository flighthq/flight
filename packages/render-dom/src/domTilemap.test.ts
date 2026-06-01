import { addTextureAtlasRegion, createImageSourceFromCanvas, createTextureAtlas } from '@flighthq/assets';
import { getOrCreateSpriteRenderNode, registerRenderer } from '@flighthq/render-core';
import { createTilemap } from '@flighthq/scenegraph-sprite';
import { TilemapKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMTilemapRenderer, drawDOMTilemap } from './domTilemap';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, TilemapKind, defaultDOMTilemapRenderer);
  return state;
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

    drawDOMTilemap(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('does nothing when rows or columns are zero', () => {
    const state = makeState();
    const tilemap = createTilemap();
    tilemap.data.tileset = makeTileset();
    tilemap.data.columns = 0;
    tilemap.data.rows = 0;
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);

    drawDOMTilemap(state, renderNode);

    expect(state.element.children.length).toBe(0);
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

    drawDOMTilemap(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends a canvas when tileset, rows, and columns are valid', () => {
    const state = makeState();
    const tilemap = createTilemap();
    tilemap.data.tileset = makeTileset();
    tilemap.data.columns = 2;
    tilemap.data.rows = 2;
    tilemap.data.tiles = new Int16Array([0, 0, 0, 0]);
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);

    drawDOMTilemap(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('CANVAS');
  });
});
