import { createBitmapText, updateBitmapText } from '@flighthq/bitmaptext';
import { createGlyphAtlas, createGlyphSourceFromGlyphAtlas } from '@flighthq/glyphatlas';
import { createWebWgpuRenderSurfaceProvider, webGlyphRasterizerBackend } from '@flighthq/host-web';
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
import { defaultWgpuBitmapTextRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { BitmapTextKind, StandardMaterialKind } from '@flighthq/types';

const canvas = createWebWgpuRenderSurfaceProvider().createRenderSurface(320, 240, 1);
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
const state = await createWgpuRenderStateFromCanvasElement(canvas, pipeline, {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
});
registerWgpuBitmapTextureResolver(state);

const atlas = createGlyphAtlas({
  fontFamily: 'sans-serif',
  fontSize: 42,
  height: 128,
  rasterizerBackend: webGlyphRasterizerBackend,
  width: 256,
});
const root = createDisplayObject();
const text = createBitmapText(createGlyphSourceFromGlyphAtlas(atlas), { letterSpacing: 2, text: 'Bitmap' });
updateBitmapText(text);
text.x = 64;
text.y = 84;
addNodeChild(root, text);

export { root, state };

prepareScene2DRender(state, root);
renderWgpuBackground(state);
renderWgpuScene2D(state, root);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene2dWgpuBitmapText', { root, state, text });
