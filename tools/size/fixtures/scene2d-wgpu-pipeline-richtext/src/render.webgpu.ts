import { createWebWgpuRenderSurfaceProvider, webRaster2DSurfaceProvider } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  createWgpuPipeline,
  createWgpuRenderStateFromCanvasElement,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuRichTextRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { createRichText } from '@flighthq/text';
import { RichTextKind } from '@flighthq/types';

const canvas = createWebWgpuRenderSurfaceProvider().createRenderSurface(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU RichText size fixture requires a canvas.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  renderers: withRegistryTableEntry(registries.renderers, RichTextKind, defaultWgpuRichTextRenderer),
});
const state = await createWgpuRenderStateFromCanvasElement(canvas, pipeline, {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
  raster2DSurfaceProvider: webRaster2DSurfaceProvider,
});

const root = createDisplayObject();
const text = createRichText({
  data: {
    background: true,
    backgroundColor: 0x24324a,
    defaultTextFormat: { color: 0xffffffff, font: 'sans-serif', size: 30 },
    height: 100,
    text: 'Rich WebGPU',
    width: 230,
  },
});
text.x = 45;
text.y = 70;
addNodeChild(root, text);

export { root, state };

prepareScene2DRender(state, root);
renderWgpuBackground(state);
renderWgpuScene2D(state, root);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene2dWgpuRichText', { root, state, text });
