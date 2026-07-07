import type { DisplayObject } from '@flighthq/sdk';
import {
  ParticleEmitterKind,
  addNodeChild,
  addTextureAtlasRegion,
  beginVelocityFrame,
  beginWgpuRenderEffectPipeline,
  createImageResource,
  createMotionBlurEffect,
  createParticleEmitter,
  createSprite,
  createTextureAtlas,
  createVelocityField,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuVelocityTarget,
  defaultWgpuMotionBlurEffectRunner,
  defaultWgpuParticleEmitterRenderer,
  defaultWgpuParticleEmitterVelocityWriter,
  endWgpuRenderEffectPipeline,
  invalidateNodeLocalTransform,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWgpuRenderEffect,
  registerWgpuVelocityWriter,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  renderWgpuVelocity,
  reserveParticleEmitter,
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

const emitter = createParticleEmitter();
emitter.data.atlas = atlas;
emitter.x = width / scale / 2;
emitter.y = height / scale / 2;
addNodeChild(root, emitter);
invalidateNodeLocalTransform(emitter);

const PARTICLE_COUNT = 8;
const RING_RADIUS = 110;
const SPRITE_SIZE = 32;
reserveParticleEmitter(emitter, PARTICLE_COUNT);
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
