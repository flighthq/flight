import {
  createWebRaster2DSurfaceProvider,
  createWebWgpuRenderSurfaceProvider,
  webCanvasRenderSurfaceCreator,
} from '@flighthq/host-web';
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
import { createCanvasShapeRasterizer, createCanvasTextureResolvers } from '@flighthq/scene2d-canvas';
import {
  defaultWgpuScale9ShapeRenderer,
  defaultWgpuShapeCommands,
  registerWgpuShapeCommands,
  registerWgpuShapeRasterizer,
  renderWgpuScene2D,
} from '@flighthq/scene2d-wgpu';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape';
import { Scale9ShapeKind } from '@flighthq/types';

installRaster2DSurfaceHostProvider(createWebRaster2DSurfaceProvider());
const canvas = createWebWgpuRenderSurfaceProvider().createRenderSurface(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU Scale9Shape size fixture requires a canvas.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  renderers: withRegistryTableEntry(registries.renderers, Scale9ShapeKind, defaultWgpuScale9ShapeRenderer),
});
const state = await createWgpuRenderStateFromCanvasElement(canvas, pipeline, {
  antialias: false,
  backgroundColor: 0x101522ff,
  pixelRatio: 1,
});
registerWgpuShapeCommands(state, defaultWgpuShapeCommands);
registerWgpuShapeRasterizer(
  state,
  createCanvasShapeRasterizer(createCanvasTextureResolvers(webCanvasRenderSurfaceCreator)),
);

const root = createDisplayObject();
const shape = createScale9Shape({ height: 50, width: 80, x: 20, y: 15 });
appendShapeBeginFill(shape, 0x9b5de5ff);
appendShapeRectangle(shape, 0, 0, 120, 80);
appendShapeEndFill(shape);
shape.x = 65;
shape.y = 55;
shape.scaleX = 1.55;
shape.scaleY = 1.45;
addNodeChild(root, shape);

export { root, state };

prepareScene2DRender(state, root);
renderWgpuBackground(state);
renderWgpuScene2D(state, root);
submitWgpuRenderPass(state);

Reflect.set(globalThis, '__flightScene2dWgpuScale9Shape', { root, shape, state });
