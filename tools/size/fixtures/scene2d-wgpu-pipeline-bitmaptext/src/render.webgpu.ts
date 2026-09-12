import { createBitmapText, updateBitmapText } from '@flighthq/bitmaptext';
import { createGlyphAtlas, createGlyphSourceFromGlyphAtlas } from '@flighthq/glyphatlas';
import { createWebWgpuCanvasElement, webHostGlyphRasterizer } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
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
import { defaultWgpuBitmapTextRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { BitmapTextKind, StandardMaterialKind } from '@flighthq/types';

const canvas = createWebWgpuCanvasElement(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU BitmapText size fixture requires a canvas.');
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
  renderers: withRegistryTableEntry(registries.renderers, BitmapTextKind, defaultWgpuBitmapTextRenderer),
});
const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, pipeline, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
registerWgpuBitmapTextureResolver(state);

const atlas = createGlyphAtlas({
  fontFamily: 'sans-serif',
  fontSize: 42,
  height: 128,
  rasterizerBackend: webHostGlyphRasterizer,
  width: 256,
});
const root = createDisplayObject();
const text = createBitmapText(createGlyphSourceFromGlyphAtlas(atlas), { letterSpacing: 2, text: 'Bitmap' });
updateBitmapText(text);
text.x = 64;
text.y = 84;
addNodeChild(root, text);

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuBitmapText', { root, state, text });
