import { createWebWgpuCanvasElement, webRaster2DSurfaceProvider } from '@flighthq/host-web';
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
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuRichTextRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { createRichText } from '@flighthq/text';
import { RichTextKind } from '@flighthq/types';

const canvas = createWebWgpuCanvasElement(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU RichText size fixture requires a canvas.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  renderers: withRegistryTableEntry(registries.renderers, RichTextKind, defaultWgpuRichTextRenderer),
});
const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, pipeline, {
  format: acquisition.format,
  pixelRatio: 1,
  raster2DSurfaceProvider: webRaster2DSurfaceProvider,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;

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

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuRichText', { root, state, text });
