import type { DisplayObject, WebGLRenderEffectPipeline, WebGLRenderTarget } from '@flighthq/sdk';
import {
  beginVelocityFrame,
  beginWebGLRenderEffectPipeline,
  createMotionBlurEffect,
  createVelocityField,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  createWebGLVelocityTarget,
  defaultWebGLMotionBlurEffectRunner,
  defaultWebGLParticleEmitterRenderer,
  defaultWebGLParticleEmitterVelocityWriter,
  endWebGLRenderEffectPipeline,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGLRenderEffect,
  registerWebGLVelocityWriter,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  renderWebGLVelocity,
  setWebGLRenderEffectVelocityTexture,
} from '@flighthq/sdk';

// The particle emitter writes per-particle velocity into the G-buffer (registerWebGLVelocityWriter with
// the particle writer); the motion-blur effect then smears each particle along its own ring-radial vector.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ParticleEmitterKind, defaultWebGLParticleEmitterRenderer);
registerWebGLRenderEffect(state, 'motionBlur', defaultWebGLMotionBlurEffectRunner);
registerWebGLVelocityWriter(state, ParticleEmitterKind, defaultWebGLParticleEmitterVelocityWriter);

const pipeline: WebGLRenderEffectPipeline = createWebGLRenderEffectPipeline(state, { sampleCount: 1 });
const velocityTarget: WebGLRenderTarget = createWebGLVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;

  // The particle writer reads each particle's velocity from emitter.data.velocities, so no per-frame field
  // contribution is needed here; the field is passed for the (unused) display-object writer path.
  beginVelocityFrame(velocityField);
  renderWebGLVelocity(state, root, velocityField, velocityTarget);
  setWebGLRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginWebGLRenderEffectPipeline(state, pipeline);
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  endWebGLRenderEffectPipeline(state, pipeline, [createMotionBlurEffect({ intensity: 1, samples: 16 })]);
}
