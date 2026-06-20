import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWebGPURenderEffectPipeline,
  createHalftoneEffect,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  defaultWebGPUHalftoneEffectRunner,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  endWebGPURenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultWebGPUMaterial,
  registerRenderer,
  registerWebGPURenderEffect,
  registerWebGPUShapeCommands,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  ShapeKind,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import { registerWebGPUFunctionalTarget } from '../../_harness/verify';

// WebGPU parity column for the same halftone intent as render.webgl.ts. WebGPU render-state init is
// async; the full-frame effect pipeline runs between renderWebGPUBackground and submitWebGPURenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerDefaultWebGPUMaterial(state);
registerWebGPURenderEffect(state, 'halftone', defaultWebGPUHalftoneEffectRunner);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [createHalftoneEffect({ scale: 4, angle: 0.4 })]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
