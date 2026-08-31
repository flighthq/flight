import { createBitmap } from '@flighthq/bitmap';
import { createWebWgpuRenderSurfaceProvider } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  createWgpuPipeline,
  createWgpuRenderStateFromCanvasElement,
  registerWgpuBitmapTextureResolver,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuTilemapRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { createTilemap } from '@flighthq/tilemap';
import { StandardMaterialKind, TilemapKind } from '@flighthq/types';

const canvas = createWebWgpuRenderSurfaceProvider().createRenderSurface(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU Tilemap size fixture requires a canvas.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  materialRenderers: withRegistryTableEntry(
    registries.materialRenderers,
    StandardMaterialKind,
    standardWgpuMaterialRenderer,
  ),
  renderers: withRegistryTableEntry(registries.renderers, TilemapKind, defaultWgpuTilemapRenderer),
});
const state = await createWgpuRenderStateFromCanvasElement(canvas, pipeline, {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
});
registerWgpuBitmapTextureResolver(state);

const atlas = createTextureAtlas({
  regions: [createTextureAtlasRegion({ height: 40, id: 0, width: 40 })],
  texture: createTexture({ dimension: '2d', source: createBitmap(40, 40, 0x3ddc97ff) }),
});
const root = createDisplayObject();
const tilemap = createTilemap({
  data: {
    atlas,
    columns: 5,
    rows: 3,
    tileHeight: 40,
    tileWidth: 40,
    tiles: new Int16Array(15).fill(0),
  },
});
tilemap.x = 60;
tilemap.y = 60;
addNodeChild(root, tilemap);

export { root, state };

prepareScene2DRender(state, root);
renderWgpuBackground(state);
renderWgpuScene2D(state, root);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene2dWgpuTilemap', { root, state, tilemap });
