import type { DisplayObject } from '@flighthq/sdk';
import {
  beginVelocityFrame,
  beginWebGPURenderEffectPipeline,
  createMotionBlurEffect,
  createVelocityField,
  createWebGPUCanvasElement,
  createWebGPURenderEffectPipeline,
  createWebGPURenderState,
  createWebGPUVelocityTarget,
  defaultWebGPUMotionBlurEffectRunner,
  defaultWebGPUParticleEmitterRenderer,
  defaultWebGPUParticleEmitterVelocityWriter,
  endWebGPURenderEffectPipeline,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGPURenderEffect,
  registerWebGPUVelocityWriter,
  renderWebGPUBackground,
  renderWebGPUDisplayObject,
  renderWebGPUVelocity,
  setWebGPURenderEffectVelocityTexture,
  submitWebGPURenderPass,
} from '@flighthq/sdk';

import { registerWebGPUFunctionalTarget } from '../../_harness/verify';

// WebGPU parity column for per-particle motion blur: the particle velocity writer rasterizes each
// particle's own velocity into the G-buffer, which the motion-blur runner smears along — a radial star.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGPUCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWebGPURenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ParticleEmitterKind, defaultWebGPUParticleEmitterRenderer);
registerWebGPURenderEffect(state, 'motionBlur', defaultWebGPUMotionBlurEffectRunner);
registerWebGPUVelocityWriter(state, ParticleEmitterKind, defaultWebGPUParticleEmitterVelocityWriter);

const pipeline = createWebGPURenderEffectPipeline(state, { sampleCount: 1 });
const velocityTarget = createWebGPUVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;

  beginVelocityFrame(velocityField);
  renderWebGPUBackground(state);
  renderWebGPUVelocity(state, root, velocityField, velocityTarget);
  setWebGPURenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginWebGPURenderEffectPipeline(state, pipeline);
  renderWebGPUDisplayObject(state, root);
  endWebGPURenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
  submitWebGPURenderPass(state);
}

registerWebGPUFunctionalTarget(state, scale);
