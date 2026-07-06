import type { DisplayObject, GlRenderEffectPipeline, GlRenderTarget } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  beginVelocityFrame,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGlVelocityTarget,
  createMotionBlurEffect,
  createVelocityField,
  defaultGlMotionBlurEffectRunner,
  defaultGlParticleEmitterRenderer,
  defaultGlParticleEmitterVelocityWriter,
  endGlRenderEffectPipeline,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerGlRenderEffect,
  registerGlVelocityWriter,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  renderGlVelocity,
  setGlRenderEffectVelocityTexture,
} from '@flighthq/sdk';

// The particle emitter writes per-particle velocity into the G-buffer (registerGlVelocityWriter with
// the particle writer); the motion-blur effect then smears each particle along its own ring-radial vector.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ParticleEmitterKind, defaultGlParticleEmitterRenderer);
registerGlRenderEffect(state, 'MotionBlurEffect', defaultGlMotionBlurEffectRunner);
registerGlVelocityWriter(state, ParticleEmitterKind, defaultGlParticleEmitterVelocityWriter);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });
const velocityTarget: GlRenderTarget = createGlVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;

  // The particle writer reads each particle's velocity from emitter.data.velocities, so no per-frame field
  // contribution is needed here; the field is passed for the (unused) display-object writer path.
  beginVelocityFrame(velocityField);
  renderGlVelocity(state, root, velocityField, velocityTarget);
  setGlRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
}
