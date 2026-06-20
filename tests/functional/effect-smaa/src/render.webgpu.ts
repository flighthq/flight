import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWebGPURenderEffectPipeline,
  createSMAAEffect,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  defaultWebGPUSMAAEffectRunner,
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

// WebGPU SMAA: single-pass approximation antialiasing the full frame's jagged edges.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerDefaultWebGPUMaterial(state);
registerWebGPURenderEffect(state, 'smaa', defaultWebGPUSMAAEffectRunner);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 4, format: 'rgba8' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [createSMAAEffect({ threshold: 0.1 })]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
