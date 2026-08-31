import { createWebGlRenderSurfaceProvider } from '@flighthq/host-web';
import { createImageResourceFromCanvas } from '@flighthq/image';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  createEmptyGlRegistries,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderState,
  getGlPipelineRegistries,
  registerGlImageTextureResolver,
  renderGlBackground,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultGlTilemapRenderer, registerGlStandardMaterial, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { createTilemap } from '@flighthq/tilemap';
import { RegistryEntryState, TilemapKind } from '@flighthq/types';

const canvas = createWebGlRenderSurfaceProvider().createRenderSurface(400, 300, 1);
if (canvas === null) throw new Error('The WebGL Tilemap size fixture requires a canvas render surface.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const emptyRegistries = createEmptyGlRegistries();
const pipeline = createGlPipeline({
  ...emptyRegistries,
  renderers: withRegistryTableEntry(emptyRegistries.renderers, TilemapKind, defaultGlTilemapRenderer),
});
const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, { contextAttributes: { alpha: false, preserveDrawingBuffer: true } }),
  ),
  pipeline,
  { backgroundColor: 0x1a1a2eff, pixelRatio: 1 },
);

const registries = getGlPipelineRegistries(pipeline);
for (const [kind, entry] of registries.renderers.entries) {
  if (entry.state === RegistryEntryState.Bound) registerRenderer(state, kind, entry.value);
}
registerGlImageTextureResolver(state);
registerGlStandardMaterial(state);

const source = document.createElement('canvas');
source.width = 64;
source.height = 32;
const sourceContext = source.getContext('2d');
if (sourceContext === null) throw new Error('The WebGL Tilemap fixture requires a 2D texture source.');
sourceContext.fillStyle = '#58d68d';
sourceContext.fillRect(0, 0, 32, 32);
sourceContext.fillStyle = '#5b8cff';
sourceContext.fillRect(32, 0, 32, 32);
const atlas = createTextureAtlas({
  regions: [
    createTextureAtlasRegion({ height: 32, id: 0, width: 32 }),
    createTextureAtlasRegion({ height: 32, id: 1, width: 32, x: 32 }),
  ],
  texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(source) }),
});

const root = createDisplayObject();
const tilemap = createTilemap({
  data: {
    atlas,
    columns: 4,
    rows: 3,
    tileHeight: 32,
    tileWidth: 32,
    tiles: new Int16Array([0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1]),
  },
});
tilemap.x = 90;
tilemap.y = 70;
addNodeChild(root, tilemap);

prepareScene2DRender(state, root);
renderGlBackground(state);
renderGlScene2D(state, root);

Reflect.set(globalThis, '__flightScene2dGlPipelineTilemap', { registries, root, tilemap });
