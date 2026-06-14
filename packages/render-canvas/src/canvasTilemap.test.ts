import {
  addTextureAtlasRegion,
  createImageSource,
  createTextureAtlas,
  createTileset,
  initTilesetRegions,
} from '@flighthq/assets';
import { getOrCreateSpriteRenderNode, prepareSpriteRender } from '@flighthq/render';
import { createTilemap, writeTilemapTile } from '@flighthq/sprite';

import { createCanvasRenderState } from './canvasRenderState';
import { drawCanvasTilemap } from './canvasTilemap';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  return createCanvasRenderState(canvas);
}

function makeTilesetAtlas(tileWidth = 32, tileHeight = 32, cols = 2, rows = 1) {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageSource(img);
  source.width = tileWidth * cols;
  source.height = tileHeight * rows;
  const atlas = createTextureAtlas({ image: source });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addTextureAtlasRegion(atlas, c * tileWidth, r * tileHeight, tileWidth, tileHeight);
    }
  }
  const tileset = createTileset({ atlas, tileWidth, tileHeight, columns: cols, rows });
  initTilesetRegions(tileset);
  return tileset;
}

describe('drawCanvasTilemap', () => {
  it('does not draw when tileset is null', () => {
    const state = makeState();
    const tilemap = createTilemap();
    prepareSpriteRender(state, tilemap);
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasTilemap(state, renderNode);
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws each non-empty tile with drawImage', () => {
    const state = makeState();
    const tileset = makeTilesetAtlas(32, 32, 2, 1);
    const tilemap = createTilemap({ data: { columns: 2, rows: 1, tileset } });
    writeTilemapTile(tilemap, 0, 0, 0);
    writeTilemapTile(tilemap, 1, 0, 1);
    prepareSpriteRender(state, tilemap);
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasTilemap(state, renderNode);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('skips cells with id -1', () => {
    const state = makeState();
    const tileset = makeTilesetAtlas(32, 32, 2, 1);
    const tilemap = createTilemap({ data: { columns: 2, rows: 1, tileset } });
    writeTilemapTile(tilemap, 0, 0, 0);
    // cell (1,0) remains -1
    prepareSpriteRender(state, tilemap);
    const renderNode = getOrCreateSpriteRenderNode(state, tilemap);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasTilemap(state, renderNode);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
