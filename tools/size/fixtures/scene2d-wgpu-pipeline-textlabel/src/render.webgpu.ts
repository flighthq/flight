import { createWebRaster2DSurfaceProvider, createWebWgpuRenderSurfaceProvider } from '@flighthq/host-web';
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
import { installRaster2DSurfaceHostProvider } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d';
import { defaultWgpuTextLabelRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import { standardWgpuMaterialRenderer } from '@flighthq/scene2d-wgpu/contract';
import { createTextLabel } from '@flighthq/text';
import { StandardMaterialKind, TextLabelKind } from '@flighthq/types';

installRaster2DSurfaceHostProvider(createWebRaster2DSurfaceProvider());
const canvas = createWebWgpuRenderSurfaceProvider().createRenderSurface(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU TextLabel size fixture requires a canvas.');
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
  renderers: withRegistryTableEntry(registries.renderers, TextLabelKind, defaultWgpuTextLabelRenderer),
});
const state = await createWgpuRenderStateFromCanvasElement(canvas, pipeline, {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
});

const root = createDisplayObject();
const text = createTextLabel({
  data: {
    height: 80,
    text: 'TextLabel',
    textFormat: { color: 0xffd166ff, font: 'sans-serif', size: 36 },
    width: 220,
  },
});
text.x = 52;
text.y = 78;
addNodeChild(root, text);

export { root, state };

prepareScene2DRender(state, root);
renderWgpuBackground(state);
renderWgpuScene2D(state, root);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene2dWgpuTextLabel', { root, state, text });
