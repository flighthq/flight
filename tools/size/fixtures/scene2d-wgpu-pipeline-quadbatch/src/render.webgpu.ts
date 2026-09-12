import { createBitmap } from '@flighthq/bitmap';
import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendQuadBatchInstance, createQuadBatch } from '@flighthq/quadbatch';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuAcquisition,
  createWgpuPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
  registerWgpuBitmapTextureResolver,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuQuadBatchRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { QuadBatchKind, StandardMaterialKind } from '@flighthq/types';

const canvas = createWebWgpuCanvasElement(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU QuadBatch size fixture requires a canvas.');
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
  renderers: withRegistryTableEntry(registries.renderers, QuadBatchKind, defaultWgpuQuadBatchRenderer),
});
const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, pipeline, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
registerWgpuBitmapTextureResolver(state);

const atlas = createTextureAtlas({
  regions: [createTextureAtlasRegion({ height: 52, id: 0, width: 52 })],
  texture: createTexture({ dimension: '2d', source: createBitmap(52, 52, 0xff7138ff) }),
});
const root = createDisplayObject();
const batch = createQuadBatch({ data: { atlas } });
appendQuadBatchInstance(batch, 0, 48, 46);
appendQuadBatchInstance(batch, 0, 120, 92);
appendQuadBatchInstance(batch, 0, 192, 54);
addNodeChild(root, batch);

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuQuadBatch', { batch, root, state });
