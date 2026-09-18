import { createBitmap } from '@flighthq/bitmap';
import { webHostWgpuContext, appendWebSurface } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
  registerWgpuBitmapTextureResolver,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuTilemapRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { createWgpuSurface } from '@flighthq/surface';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { createTilemap } from '@flighthq/tilemap';
import { StandardMaterialKind, TilemapKind } from '@flighthq/types';

const wgpuSurface = await createWgpuSurface(webHostWgpuContext, 320, 240);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
document.body.style.margin = '0';
appendWebSurface(wgpuSurface, document.body);
const target = wgpuSurface.target;

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

const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, target, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, pipeline, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
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

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuTilemap', { root, state, tilemap });
