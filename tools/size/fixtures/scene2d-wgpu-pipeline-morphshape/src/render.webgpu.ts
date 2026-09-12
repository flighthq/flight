import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { appendPathCircle, appendPathRectangle, createPath, createPathMorph } from '@flighthq/path';
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
import { defaultWgpuMorphShapeRenderer, renderWgpuScene2D } from '@flighthq/scene2d-wgpu';
import {
  appendMorphShapePath,
  appendShapeBeginFill,
  appendShapeEndFill,
  createMorphShape,
  setMorphShapeProgress,
} from '@flighthq/shape';
import { MorphShapeKind } from '@flighthq/types';

const canvas = createWebWgpuCanvasElement(320, 240, 1);
if (canvas === null) throw new Error('The WebGPU MorphShape size fixture requires a canvas.');
document.body.style.margin = '0';
document.body.appendChild(canvas);

const registries = createEmptyWgpuRegistries();
const pipeline = createWgpuPipeline({
  ...registries,
  renderers: withRegistryTableEntry(registries.renderers, MorphShapeKind, defaultWgpuMorphShapeRenderer),
});
const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, pipeline, { format: acquisition.format, pixelRatio: 1 });
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
export const screenClear = { color: [0x10 / 0xff, 0x15 / 0xff, 0x22 / 0xff, 1], depth: 1.0 } as const;

const start = createPath();
appendPathRectangle(start, 0, 0, 120, 90);
const end = createPath();
appendPathCircle(end, 60, 45, 45);
const morph = createPathMorph(start, end);
if (morph === null) throw new Error('The WebGPU MorphShape fixture requires compatible paths.');
const root = createDisplayObject();
const shape = createMorphShape(morph);
appendShapeBeginFill(shape, 0xff6b6bff);
appendMorphShapePath(shape);
appendShapeEndFill(shape);
setMorphShapeProgress(shape, 0.5);
shape.x = 90;
shape.y = 70;
addNodeChild(root, shape);

export { root };

prepareScene2DRender(state, root);
const pass = beginWgpuRenderPass(state, screen, screenClear);
renderWgpuScene2D(pass, root);
endWgpuRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dWgpuMorphShape', { root, shape, state });
