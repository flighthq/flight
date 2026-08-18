import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ParticleEmitter2DKind,
  addNodeChild,
  addTextureAtlasRegion,
  beginVelocityFrame,
  beginWgpuRenderEffectPipeline,
  createImageResource,
  createMotionBlurEffect,
  createParticleEmitter2D,
  createSprite,
  createTexture,
  createTextureAtlas,
  createVelocityField,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuVelocityTarget,
  registerWgpuMotionBlurEffect,
  defaultWgpuParticleEmitter2DRenderer,
  defaultWgpuParticleEmitter2DVelocityWriter,
  endWgpuRenderEffectPipeline,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  registerRenderer,
  registerWgpuImageTextureResolver,
  registerWgpuVelocityWriter,
  renderWgpuBackground,
  renderWgpuScene2D,
  renderWgpuVelocity,
  reserveParticleEmitter2D,
  setWgpuRenderEffectVelocityTexture,
  submitWgpuRenderPass,
  getBitmapPixelRgb,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'On an 800×600 near-black blue-grey field (about R16 G16 B20), eight pale blue-white glows form a ' +
    'ring of 110 px radius around (400,300), at the cardinal and diagonal positions. Each 32 px ' +
    'source glow is spread outward from the ring into a broad dim radial streak, so the eight streaks ' +
    'read as a small starburst and the original fully bright cores are absent. The ring radius and ' +
    'the 45-degree spacing remain clear; the result is not one shared-direction smear, a solid halo ' +
    'or eight crisp dots, and the field outside the starburst stays near-black.',
);

// Wgpu parity column for per-particle motion blur: the particle velocity writer rasterizes each
// particle's own velocity into the G-buffer, which the motion-blur runner smears along — a radial star.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerWgpuImageTextureResolver(state);
registerRenderer(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DRenderer);
registerWgpuMotionBlurEffect(state);
registerWgpuVelocityWriter(state, ParticleEmitter2DKind, defaultWgpuParticleEmitter2DVelocityWriter);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });
const velocityTarget = createWgpuVelocityTarget(state, canvas.width, canvas.height);
const velocityField = createVelocityField();

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;

  beginVelocityFrame(velocityField);
  renderWgpuBackground(state);
  renderWgpuVelocity(state, root, velocityField, velocityTarget);
  setWgpuRenderEffectVelocityTexture(pipeline, velocityTarget.texture);

  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
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

const atlas = createTextureAtlas({
  texture: createTexture({ dimension: '2d', source: createImageResource(makeGlowCanvas()) }),
});
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

// Motion blur redistributes each particle's energy along its velocity: the bright cores vanish and a wide
// dim smear takes their place. Both facts are invisible to the regression fingerprint, whose committed
// grid scores 0.57 against a uniform frame of its own background — the whole picture is worth a ninth of
// the gate's threshold, so nothing confined to it can ever fail. Measured with the effect applied vs the
// same scene rendered with the pipeline bypassed: mid-dim 0.01170 vs 0.00401, bright cores 0.00000 vs
// 0.00312. The floors sit between the two arms.
//
// LIMIT, stated because the scene's purpose is narrower than what this proves: this verifies the blur was
// APPLIED, not that each particle was smeared along its OWN vector. A single shared blur direction — the
// bug per-particle velocity exists to prevent — also erases the cores and also fills the mid band, so it
// would pass. Radial extent cannot separate them here either: the smear is a few pixels against a ring
// radius of ~0.42 of the frame, so both arms measure the ring, not the streak.
export function assertRender(frame: Readonly<Bitmap>): void {
  const { brightCores, midDim } = measureSmear(frame);
  if (midDim < 0.008) {
    throw new Error(
      `[particle-motion-blur] mid-dim coverage is ${(midDim * 100).toFixed(3)}% (expected >= 0.8%) — the ` +
        `particles carry no smear, so the motion-blur pass did not reach the frame`,
    );
  }
  if (brightCores > 0.0005) {
    throw new Error(
      `[particle-motion-blur] ${(brightCores * 100).toFixed(3)}% of the frame is still at full particle ` +
        `brightness (expected <= 0.05%) — the cores were never spread along their velocity`,
    );
  }
}

function measureSmear(frame: Readonly<Bitmap>): { brightCores: number; midDim: number } {
  let midDim = 0;
  let brightCores = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const value = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (value > 40 && value <= 90) midDim += 1;
      else if (value > 160) brightCores += 1;
    }
  }
  const total = frame.width * frame.height;
  return { brightCores: brightCores / total, midDim: midDim / total };
}
