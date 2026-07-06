import type { DisplayObject } from '@flighthq/sdk';
import {
  beginVelocityFrame,
  beginWgpuRenderEffectPipeline,
  createMotionBlurEffect,
  createVelocityField,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuVelocityTarget,
  defaultWgpuMotionBlurEffectRunner,
  defaultWgpuParticleEmitterRenderer,
  defaultWgpuParticleEmitterVelocityWriter,
  endWgpuRenderEffectPipeline,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWgpuRenderEffect,
  registerWgpuVelocityWriter,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  renderWgpuVelocity,
  setWgpuRenderEffectVelocityTexture,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for per-particle motion blur: the particle velocity writer rasterizes each
// particle's own velocity into the G-buffer, which the motion-blur runner smears along — a radial star.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ParticleEmitterKind, defaultWgpuParticleEmitterRenderer);
registerWgpuRenderEffect(state, 'MotionBlurEffect', defaultWgpuMotionBlurEffectRunner);
registerWgpuVelocityWriter(state, ParticleEmitterKind, defaultWgpuParticleEmitterVelocityWriter);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });
const velocityTarget = createWgpuVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;

  beginVelocityFrame(velocityField);
  renderWgpuBackground(state);
  renderWgpuVelocity(state, root, velocityField, velocityTarget);
  setWgpuRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);
