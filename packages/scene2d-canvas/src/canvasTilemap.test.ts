import { createImageResource } from '@flighthq/image/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { addTextureAtlasRegion, createTextureAtlasFromImageResource } from '@flighthq/textureatlas/contract';
import { createTilemap, setTilemapTile } from '@flighthq/tilemap/contract';

import { registerCanvasImageTextureResolver } from './canvasImageTextureResolver';
import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';
import { drawCanvasTilemap } from './canvasTilemap';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const state = createCanvasRenderState(canvas);
  registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
  return state;
}

function makeTilesetAtlas(tileWidth = 32, tileHeight = 32, cols = 2, rows = 1) {
  const img = document.createElement('img') as HTMLImageElement;
  const source = createImageResource(img);
  source.width = tileWidth * cols;
  source.height = tileHeight * rows;
  const atlas = createTextureAtlasFromImageResource(source);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      addTextureAtlasRegion(atlas, c * tileWidth, r * tileHeight, tileWidth, tileHeight);
    }
  }
  return { atlas, tileHeight, tileWidth };
}

describe('drawCanvasTilemap', () => {
  it('does not draw when atlas is null', () => {
    const state = makeState();
    const tilemap = createTilemap();
    prepareScene2DRender(state, tilemap);
    const renderProxy = getOrCreateRenderProxy2D(state, tilemap);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasTilemap(state, renderProxy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('draws each non-empty tile with drawImage', () => {
    const state = makeState();
    const layout = makeTilesetAtlas(32, 32, 2, 1);
    const tilemap = createTilemap({ data: { columns: 2, rows: 1, ...layout } });
    setTilemapTile(tilemap, 0, 0, 0);
    setTilemapTile(tilemap, 1, 0, 1);
    prepareScene2DRender(state, tilemap);
    const renderProxy = getOrCreateRenderProxy2D(state, tilemap);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasTilemap(state, renderProxy);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('skips cells with id -1', () => {
    const state = makeState();
    const layout = makeTilesetAtlas(32, 32, 2, 1);
    const tilemap = createTilemap({ data: { columns: 2, rows: 1, ...layout } });
    setTilemapTile(tilemap, 0, 0, 0);
    // cell (1,0) remains -1
    prepareScene2DRender(state, tilemap);
    const renderProxy = getOrCreateRenderProxy2D(state, tilemap);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasTilemap(state, renderProxy);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
