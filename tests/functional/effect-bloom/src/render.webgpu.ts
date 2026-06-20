import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWebGPURenderEffectPipeline,
  createBloomEffect,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  defaultWebGPUBloomEffectRunner,
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

// WebGPU parity column for the same bloom intent as render.webgl.ts. WebGPU render-state init is
// async (createWebGPURenderState returns a Promise). The effect pipeline runs between
// renderWebGPUBackground (opens the command encoder + canvas pass) and submitWebGPURenderPass
// (flushes it); the HDR rgba16f scene target is bright-passed, blurred, and added back.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerDefaultWebGPUMaterial(state);
registerWebGPURenderEffect(state, 'bloom', defaultWebGPUBloomEffectRunner);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 4, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.6, intensity: 1.4 })]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
