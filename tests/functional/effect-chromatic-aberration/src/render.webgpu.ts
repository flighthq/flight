import type { DisplayObject } from '@flighthq/sdk';
import {
  beginWebGPURenderEffectPipeline,
  createChromaticAberrationEffect,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  defaultWebGPUChromaticAberrationEffectRunner,
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

// WebGPU parity column for the same chromatic-aberration intent as render.webgl.ts. Unlike Canvas
// (passthrough), chromatic aberration is a real effect on WebGPU: the R/G/B channels are sampled
// with a growing radial offset. WebGPU render-state init is async; the effect pipeline runs between
// renderWebGPUBackground and submitWebGPURenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWebGPUShapeRenderer);
registerWebGPUShapeCommands(defaultWebGPUShapeCommands);
registerDefaultWebGPUMaterial(state);
registerWebGPURenderEffect(state, 'chromaticAberration', defaultWebGPUChromaticAberrationEffectRunner);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGPUBackground(state);
  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [createChromaticAberrationEffect({ intensity: 4, radial: true })]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
