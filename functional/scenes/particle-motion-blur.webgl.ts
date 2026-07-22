import type { DisplayObject, GlRenderEffectPipeline, GlRenderTarget } from '@flighthq/sdk';
import {
  ParticleEmitter2DKind,
  addNodeChild,
  addTextureAtlasRegion,
  beginGlRenderEffectPipeline,
  beginVelocityFrame,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGlVelocityTarget,
  createImageResource,
  createMotionBlurEffect,
  createParticleEmitter2D,
  createSprite,
  createTextureAtlas,
  createVelocityField,
  defaultGlMotionBlurEffectRunner,
  defaultGlParticleEmitter2DRenderer,
  defaultGlParticleEmitter2DVelocityWriter,
  endGlRenderEffectPipeline,
  invalidateNodeLocalTransform,
  prepareDisplayObjectRender,
  registerGlRenderEffect,
  registerGlVelocityWriter,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  renderGlVelocity,
  reserveParticleEmitter2D,
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
registerRenderer(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DRenderer);
registerGlRenderEffect(state, 'MotionBlurEffect', defaultGlMotionBlurEffectRunner);
registerGlVelocityWriter(state, ParticleEmitter2DKind, defaultGlParticleEmitter2DVelocityWriter);

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

// Per-particle motion blur: eight particles arranged in a ring, each given a velocity pointing radially
// outward, so the velocity G-buffer + motion-blur effect must smear every particle along its OWN vector
// (a radial star), not one shared direction. This is what a per-particle velocity writer buys over a
// coarse whole-emitter velocity. Particle data is set explicitly (no simulation) for a deterministic frame.

function makeGlowCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(120,200,255,0.95)');
  grad.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return c;
}

const atlas = createTextureAtlas({ image: createImageResource(makeGlowCanvas()) });
addTextureAtlasRegion(atlas, 0, 0, 32, 32);

const root = createSprite();
root.scaleX = scale;
root.scaleY = scale;
invalidateNodeLocalTransform(root);

const emitter = createParticleEmitter2D();
emitter.data.atlas = atlas;
emitter.x = width / scale / 2;
emitter.y = height / scale / 2;
addNodeChild(root, emitter);
invalidateNodeLocalTransform(emitter);

const PARTICLE_COUNT = 8;
const RING_RADIUS = 110;
const SPRITE_SIZE = 32;
reserveParticleEmitter2D(emitter, PARTICLE_COUNT);
emitter.data.particleCount = PARTICLE_COUNT;
for (let i = 0; i < PARTICLE_COUNT; i++) {
  const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
  const cx = Math.cos(angle) * RING_RADIUS;
  const cy = Math.sin(angle) * RING_RADIUS;
  emitter.data.ids[i] = 0;
  emitter.data.alphas[i] = 1;
  emitter.data.colors[i * 3] = 1;
  emitter.data.colors[i * 3 + 1] = 1;
  emitter.data.colors[i * 3 + 2] = 1;
  // transforms position is the quad's top-left anchor; offset by half the sprite to center it on the ring.
  emitter.data.transforms[i * 4] = cx - SPRITE_SIZE / 2;
  emitter.data.transforms[i * 4 + 1] = cy - SPRITE_SIZE / 2;
  emitter.data.transforms[i * 4 + 2] = 0;
  emitter.data.transforms[i * 4 + 3] = 1;
  // Velocity points radially outward, so each particle smears in its own direction.
  emitter.data.velocities[i * 2] = Math.cos(angle) * 60;
  emitter.data.velocities[i * 2 + 1] = Math.sin(angle) * 60;
}

render(root);
