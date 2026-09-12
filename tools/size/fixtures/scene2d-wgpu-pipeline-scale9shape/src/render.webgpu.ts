import {
  createWebWgpuRenderSurfaceProvider,
  webCanvasRenderSurfaceCreator,
  webRaster2DSurfaceProvider,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { withRegistryTableEntry } from '@flighthq/registry';
import { prepareScene2DRender } from '@flighthq/render';
import {
  beginWgpuRenderPass,
  createWgpuAcquisitionFromCanvasElement,
  createWgpuPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderPass,
} from '@flighthq/render-wgpu';
import { createEmptyWgpuRegistries } from '@flighthq/render-wgpu/contract';
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

const canvas = createWebWgpuRenderSurfaceProvider().createRenderSurface(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU Scale9Shape size fixture requires a canvas.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  renderers: withRegistryTableEntry(registries.renderers, Scale9ShapeKind, defaultWgpuScale9ShapeRenderer),
});
const acquisition = await createWgpuAcquisitionFromCanvasElement(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, pipeline, {
  format: acquisition.format,
  pixelRatio: 1,
  raster2DSurfaceProvider: webRaster2DSurfaceProvider,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;
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

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuScale9Shape', { root, shape, state });
