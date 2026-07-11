import {
  applyParticleForces,
  buildParticleCurve,
  createParticleEmitterConfig,
  createParticleEmitterState,
  particleColorCurveFromKeyframes,
} from '@flighthq/particles';
import {
  addTextureAtlasRegion,
  BlendMode,
  createImageResource,
  createParticleEmitter,
  createTextureAtlas,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  updateParticleEmitter,
} from '@flighthq/sdk';
import Stats from 'stats.js';

import { canvas, render, scale } from './render';

const WIDTH = 800;
const HEIGHT = 400;

// Procedural spark texture: soft radial glow, warm white → orange → transparent.
const sparkCanvas = document.createElement('canvas');
sparkCanvas.width = 16;
sparkCanvas.height = 16;
const ctx = sparkCanvas.getContext('2d')!;
// Additive glow tuning: contribution is color × alpha, so keep the saturated warmth at HIGH alpha
// (a small hot core, a vivid orange body that stays opaque, a strong red still carrying alpha)
// and only fade to nothing at the rim. This reads as vivid embers under additive+premultiplied,
// without relying on the old straight-alpha bug (colored pixels at alpha 0) to fake saturation.
const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
grad.addColorStop(0, 'rgba(255, 248, 170, 1)'); // hot warm-white core
grad.addColorStop(0.25, 'rgba(255, 150, 20, 1)'); // vivid orange, full alpha
grad.addColorStop(0.6, 'rgba(255, 55, 0, 0.7)'); // saturated red-orange, still carrying alpha
grad.addColorStop(1, 'rgba(150, 0, 0, 0)'); // fade out at the rim
ctx.fillStyle = grad;
ctx.fillRect(0, 0, 16, 16);

const atlas = createTextureAtlas({ image: createImageResource(sparkCanvas) });
addTextureAtlasRegion(atlas, 0, 0, 16, 16);

const emitter = createParticleEmitter();
emitter.data.atlas = atlas;
// Sparks are a glow: add their (premultiplied) light onto the dark background so overlapping
// embers brighten, instead of compositing normally. With premultiplied textures the warm,
// low-alpha tail correctly contributes a soft additive falloff rather than a hard color edge.
emitter.blendMode = BlendMode.Add;
// World-space particles are rendered directly in physical pixels and ignore the
// emitter node's transform, so the node stays unscaled and we author magnitudes
// in physical px below (× scale).
emitter.scaleX = 1;
emitter.scaleY = 1;
emitter.x = (WIDTH * scale) / 2;
emitter.y = (HEIGHT * scale) / 2;

// Shared lifetime curves (normalised over each spark's life, resolution-independent).
// Scale pops on spawn then shrinks to nothing; alpha stays bright then fades with a
// tail; tint runs white-hot → orange → ember-red.
const scaleCurve = buildParticleCurve((t) => {
  const pop = t < 0.15 ? 0.7 + (1 - 0.7) * (t / 0.15) : 1; // 0.7 → 1.0 over first 15%
  return pop * (1 - t); // then taper to 0 by end of life
});
const alphaCurve = buildParticleCurve((t) => 1 - t * t); // bright, then accelerating fade
const colorCurve = particleColorCurveFromKeyframes([
  { time: 0, r: 1, g: 1, b: 0.85 },
  { time: 0.35, r: 1, g: 0.5, b: 0.1 },
  { time: 1, r: 0.55, g: 0.05, b: 0 },
]);

// World-space emission gives a real trail: sparks are left behind in the world
// (they don't drag with the cursor), spawn positions are interpolated along the
// cursor's path for continuous streaks, and they inherit some cursor momentum.
const config = createParticleEmitterConfig({
  worldSpace: true,
  velocityInheritance: 0.35,
  spawnRate: 250,
  lifetimeMin: 0.2,
  lifetimeMax: 0.55,
  speedMin: 40 * scale,
  speedMax: 130 * scale,
  spread: Math.PI * 2,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 200 * scale,
  alphaCurve,
  scaleCurve,
  colorCurve,
  scaleMin: 0.4 * scale,
  scaleMax: 1.4 * scale,
  maxParticles: 3000,
});

const configPressed = createParticleEmitterConfig({
  worldSpace: true,
  velocityInheritance: 0.35,
  spawnRate: 1500,
  lifetimeMin: 0.3,
  lifetimeMax: 0.8,
  speedMin: 100 * scale,
  speedMax: 350 * scale,
  spread: Math.PI * 2,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 300 * scale,
  alphaCurve,
  scaleCurve,
  colorCurve,
  scaleMin: 0.6 * scale,
  scaleMax: 2.0 * scale,
  maxParticles: 3000,
});

// Opt-in force pass: light air drag so sparks decelerate, plus gentle turbulence
// so the trail shimmers instead of moving in clean arcs.
const forces = [
  { kind: 'DragForce', strength: 0.9 },
  { kind: 'TurbulenceForce', strength: 90 * scale, scale: 0.01 },
] as const;

const simState = createParticleEmitterState();

// Stats overlay
const stats = new Stats();
stats.dom.style.position = 'absolute';
document.body.appendChild(stats.dom);

const counter = document.createElement('div');
counter.style.cssText =
  'position:fixed;bottom:0;right:0;padding:4px 8px;background:rgba(0,0,0,0.6);color:#ccc;font:11px monospace;z-index:10000';
document.body.appendChild(counter);

let mouseX = (WIDTH * scale) / 2;
let mouseY = (HEIGHT * scale) / 2;
let pointerDown = false;
let emitterVelX = 0;
let emitterVelY = 0;

const SPRING = 300;
const DAMPING = 22;

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (WIDTH / rect.width) * scale;
  mouseY = (e.clientY - rect.top) * (HEIGHT / rect.height) * scale;
});

canvas.addEventListener('pointerdown', () => {
  pointerDown = true;
});
canvas.addEventListener('pointerup', () => {
  pointerDown = false;
});

let lastTime = performance.now();

function enterFrame(): void {
  stats.begin();

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  emitterVelX += ((mouseX - emitter.x) * SPRING - emitterVelX * DAMPING) * dt;
  emitterVelY += ((mouseY - emitter.y) * SPRING - emitterVelY * DAMPING) * dt;
  emitter.x += emitterVelX * dt;
  emitter.y += emitterVelY * dt;
  invalidateNodeLocalTransform(emitter);

  // Emitter world matrix: translation only (sizes/speeds are already physical px).
  const worldTransform = { a: 1, b: 0, c: 0, d: 1, tx: emitter.x, ty: emitter.y };

  // Forces act on last frame's live particles before this frame integrates them.
  applyParticleForces(emitter, simState, forces, dt);
  updateParticleEmitter(emitter, simState, pointerDown ? configPressed : config, dt, undefined, worldTransform);
  invalidateNodeAppearance(emitter);

  counter.textContent = `${emitter.data.particleCount} particles`;

  render(emitter);

  stats.end();
  requestAnimationFrame(enterFrame);
}

invalidateNodeLocalTransform(emitter);
enterFrame();
