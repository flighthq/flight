import { webCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene2d';
import {
  createCanvasPipeline,
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  createEmptyCanvasRegistries,
  defaultCanvasTilemapRenderer,
  getCanvasPipelineRegistries,
  getCanvasRenderStateTextureResolvers,
  registerCanvasImageTextureResolver,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/scene2d-canvas';
import { createTexture } from '@flighthq/texture';
import { addTextureAtlasRegion, createTextureAtlas } from '@flighthq/textureatlas';
import { createTilemap, setTilemapTile } from '@flighthq/tilemap';
import { RegistryEntryState, TilemapKind } from '@flighthq/types';

// REQUIRED WIRING for one tile grid, and nothing else:
//   surface   webCanvasRenderSurfaceCreator — the single Canvas surface provider, NOT the aggregate
//             webHost.
//   renderer  TilemapKind -> defaultCanvasTilemapRenderer
//   commands  NONE. A Tilemap replays no shape command stream.
//   resolvers ONE image texture resolver. Every tile samples a region of the tileset atlas.
//
// ★ TILES DEFAULT TO -1, WHICH IS EMPTY. `createTilemapData` allocates `columns * rows` and fills it
// with -1, so a tilemap that is never populated renders nothing while still reporting a plausible
// size. The explicit `setTilemapTile` calls below are what make this fixture measure a grid that
// actually draws; two distinct region ids are used so the per-tile atlas lookup runs rather than
// resolving one region once.

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 300;
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyCanvasRegistries();
const pipeline = createCanvasPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, TilemapKind, defaultCanvasTilemapRenderer),
});

const state = createCanvasRenderState(
  createCanvasRenderSurface(webCanvasRenderSurfaceCreator, canvas, { height: 300, pixelRatio: 1, width: 400 }),
  pipeline,
  createCanvasTextureResolvers(webCanvasRenderSurfaceCreator),
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const registries = getCanvasPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));

const tileset = document.createElement('canvas');
tileset.width = 64;
tileset.height = 32;
const tilesetContext = tileset.getContext('2d')!;
tilesetContext.fillStyle = '#ff4d67';
tilesetContext.fillRect(0, 0, 32, 32);
tilesetContext.fillStyle = '#4d9fff';
tilesetContext.fillRect(32, 0, 32, 32);

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(tileset) }),
});
addTextureAtlasRegion(atlas, 0, 0, 32, 32);
addTextureAtlasRegion(atlas, 32, 0, 32, 32);

const root = createDisplayObject();
// The grid is described as a partial on the public constructor rather than by building a TilemapData
// directly: `createTilemapData` is contract-only, and a size fixture stands in for an end-user app, so
// it must stay on the public `.` lane the way a consumer would.
const tilemap = createTilemap({
  data: { atlas, columns: 4, rows: 3, tileHeight: 32, tileWidth: 32 },
});
for (let row = 0; row < 3; row += 1) {
  for (let column = 0; column < 4; column += 1) {
    setTilemapTile(tilemap, column, row, (column + row) % 2);
  }
}
tilemap.x = 60;
tilemap.y = 40;
addNodeChild(root, tilemap);

prepareScene2DRender(state, root);
renderCanvasBackground(state);
renderCanvasScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dCanvasTilemap', { registries, root });
