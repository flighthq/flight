import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWebGPURenderEffectPipeline,
  createBloomEffect,
  createColorGradeEffect,
  createVignetteEffect,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  defaultWebGPUBloomEffectRunner,
  defaultWebGPUColorGradeEffectRunner,
  defaultWebGPUShapeCommands,
  defaultWebGPUShapeRenderer,
  defaultWebGPUVignetteEffectRunner,
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

// WebGPU parity column for the same three-stage chain as render.webgl.ts: bloom, then color grade,
// then vignette. The pipeline ping-pongs between offscreen targets so each registered runner reads
// the previous stage's output. HDR rgba16f keeps the bright pass intact for bloom.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerDefaultWebGPUMaterial(state);
registerWebGPURenderEffect(state, 'bloom', defaultWebGPUBloomEffectRunner);
registerWebGPURenderEffect(state, 'colorGrade', defaultWebGPUColorGradeEffectRunner);
registerWebGPURenderEffect(state, 'vignette', defaultWebGPUVignetteEffectRunner);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 4, format: 'rgba16f' });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeEffect({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
