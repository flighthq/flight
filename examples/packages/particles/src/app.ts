import {
  applyParticleForces,
  buildParticleCurve,
  createParticleEmitterConfig,
  createParticleEmitterState,
  particleColorCurveFromKeyframes,
} from '@flighthq/particles';
import type { ParticleForce } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  BlendMode,
  createDisplayObject,
  createImageResource,
  createParticleEmitter,
  createTextLabel,
  createTextureAtlas,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  updateParticleEmitter,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const WIDTH = 800;
const HEIGHT = 500;

// Root container holds both emitters and the HUD label.
const root = createDisplayObject();

// Procedural spark texture: soft radial glow, warm white core fading to orange then transparent.
const sparkCanvas = document.createElement('canvas');
sparkCanvas.width = 16;
sparkCanvas.height = 16;
const sparkCtx = sparkCanvas.getContext('2d')!;
const sparkGrad = sparkCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
sparkGrad.addColorStop(0, 'rgba(255, 248, 170, 1)');
sparkGrad.addColorStop(0.25, 'rgba(255, 150, 20, 1)');
sparkGrad.addColorStop(0.6, 'rgba(255, 55, 0, 0.7)');
sparkGrad.addColorStop(1, 'rgba(150, 0, 0, 0)');
sparkCtx.fillStyle = sparkGrad;
sparkCtx.fillRect(0, 0, 16, 16);

const fireAtlas = createTextureAtlas({ image: createImageResource(sparkCanvas) });
addTextureAtlasRegion(fireAtlas, 0, 0, 16, 16);

// Procedural snowflake texture: soft white radial glow.
const snowCanvas = document.createElement('canvas');
snowCanvas.width = 12;
snowCanvas.height = 12;
const snowCtx = snowCanvas.getContext('2d')!;
const snowGrad = snowCtx.createRadialGradient(6, 6, 0, 6, 6, 6);
snowGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
snowGrad.addColorStop(0.4, 'rgba(220, 235, 255, 0.8)');
snowGrad.addColorStop(0.7, 'rgba(180, 210, 255, 0.3)');
snowGrad.addColorStop(1, 'rgba(140, 180, 255, 0)');
snowCtx.fillStyle = snowGrad;
snowCtx.fillRect(0, 0, 12, 12);

const snowAtlas = createTextureAtlas({ image: createImageResource(snowCanvas) });
addTextureAtlasRegion(snowAtlas, 0, 0, 12, 12);

// Fire emitter: additive glow, follows mouse, world-space trail.
const fireEmitter = createParticleEmitter();
fireEmitter.data.atlas = fireAtlas;
fireEmitter.blendMode = BlendMode.Add;
fireEmitter.scaleX = 1;
fireEmitter.scaleY = 1;
fireEmitter.x = (WIDTH * scale) / 4;
fireEmitter.y = (HEIGHT * scale) / 2;
addNodeChild(root, fireEmitter);

const fireScaleCurve = buildParticleCurve((t) => {
  const pop = t < 0.15 ? 0.7 + 0.3 * (t / 0.15) : 1;
  return pop * (1 - t);
});
const fireAlphaCurve = buildParticleCurve((t) => 1 - t * t);
const fireColorCurve = particleColorCurveFromKeyframes([
  { time: 0, r: 1, g: 1, b: 0.85 },
  { time: 0.35, r: 1, g: 0.5, b: 0.1 },
  { time: 1, r: 0.55, g: 0.05, b: 0 },
]);

const fireConfig = createParticleEmitterConfig({
  worldSpace: true,
  velocityInheritance: 0.35,
  spawnRate: 300,
  lifetimeMin: 0.2,
  lifetimeMax: 0.55,
  speedMin: 40 * scale,
  speedMax: 130 * scale,
  spread: Math.PI * 2,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 200 * scale,
  alphaCurve: fireAlphaCurve,
  scaleCurve: fireScaleCurve,
  colorCurve: fireColorCurve,
  scaleMin: 0.4 * scale,
  scaleMax: 1.4 * scale,
  maxParticles: 3000,
});

// Forces for fire: drag decelerates sparks, turbulence adds shimmer.
const fireForces: readonly ParticleForce[] = [
  { kind: 'DragForce', strength: 0.9 },
  { kind: 'TurbulenceForce', strength: 90 * scale, scale: 0.01 },
];

const fireSimState = createParticleEmitterState();

// Snow emitter: normal blend, fixed position at top-right, gentle downward drift.
const snowEmitter = createParticleEmitter();
snowEmitter.data.atlas = snowAtlas;
snowEmitter.scaleX = 1;
snowEmitter.scaleY = 1;
// Snow spawns across the right half of the canvas.
snowEmitter.x = (WIDTH * scale * 3) / 4;
snowEmitter.y = 0;
addNodeChild(root, snowEmitter);

const snowScaleCurve = buildParticleCurve((t) => {
  // Fade in over first 10%, hold, then shrink away in last 20%.
  if (t < 0.1) return t / 0.1;
  if (t > 0.8) return (1 - t) / 0.2;
  return 1;
});
const snowAlphaCurve = buildParticleCurve((t) => {
  // Fade in then gentle fade out.
  if (t < 0.1) return t / 0.1;
  return 1 - t * 0.6;
});
const snowColorCurve = particleColorCurveFromKeyframes([
  { time: 0, r: 1, g: 1, b: 1 },
  { time: 0.5, r: 0.85, g: 0.92, b: 1 },
  { time: 1, r: 0.7, g: 0.82, b: 1 },
]);

const snowConfig = createParticleEmitterConfig({
  worldSpace: true,
  velocityInheritance: 0,
  spawnRate: 80,
  lifetimeMin: 2,
  lifetimeMax: 4,
  speedMin: 15 * scale,
  speedMax: 40 * scale,
  // Spread slightly downward with some horizontal variation.
  spread: Math.PI * 0.6,
  directionX: 0,
  directionY: 1,
  gravityX: 0,
  gravityY: 20 * scale,
  alphaCurve: snowAlphaCurve,
  scaleCurve: snowScaleCurve,
  colorCurve: snowColorCurve,
  scaleMin: 0.3 * scale,
  scaleMax: 0.9 * scale,
  maxParticles: 500,
  // Snow spawns across a wide horizontal band.
  emitterShape: 'rect',
  emitterWidth: (WIDTH * scale) / 2,
  emitterHeight: 2,
});

// Forces for snow: light drag, gentle turbulence for drifting, and a mild horizontal wind.
const snowForces: readonly ParticleForce[] = [
  { kind: 'DragForce', strength: 0.3 },
  { kind: 'TurbulenceForce', strength: 30 * scale, scale: 0.005 },
  { kind: 'WindForce', x: 15 * scale, y: 0 },
];

const snowSimState = createParticleEmitterState();

// Particle count HUD label.
const countLabel = createTextLabel();
countLabel.data.text = '0 particles';
countLabel.data.textFormat = { size: 12, color: 0x999999 };
countLabel.x = 8 * scale;
countLabel.y = (HEIGHT - 20) * scale;
invalidateNodeLocalTransform(countLabel);
addNodeChild(root, countLabel);

// Mouse tracking for the fire emitter.
let mouseX = (WIDTH * scale) / 4;
let mouseY = (HEIGHT * scale) / 2;
let fireVelX = 0;
let fireVelY = 0;

const SPRING = 300;
const DAMPING = 22;

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left) * (WIDTH / rect.width) * scale;
  mouseY = (e.clientY - rect.top) * (HEIGHT / rect.height) * scale;
});

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // Spring-follow the mouse for the fire emitter.
  fireVelX += ((mouseX - fireEmitter.x) * SPRING - fireVelX * DAMPING) * dt;
  fireVelY += ((mouseY - fireEmitter.y) * SPRING - fireVelY * DAMPING) * dt;
  fireEmitter.x += fireVelX * dt;
  fireEmitter.y += fireVelY * dt;
  invalidateNodeLocalTransform(fireEmitter);

  // World-space emitter: it bakes spawns through its own node world transform (set above), so nothing to pass.
  applyParticleForces(fireEmitter, fireSimState, fireForces, dt);
  updateParticleEmitter(fireEmitter, fireSimState, fireConfig, dt);
  invalidateNodeAppearance(fireEmitter);

  // Snow emitter stays fixed at its node position.
  applyParticleForces(snowEmitter, snowSimState, snowForces, dt);
  updateParticleEmitter(snowEmitter, snowSimState, snowConfig, dt);
  invalidateNodeAppearance(snowEmitter);

  // Update the particle count label.
  const total = fireEmitter.data.particleCount + snowEmitter.data.particleCount;
  countLabel.data.text = `${total} particles`;
  invalidateNodeAppearance(countLabel);

  render(root);
  requestAnimationFrame(enterFrame);
}

invalidateNodeLocalTransform(fireEmitter);
invalidateNodeLocalTransform(snowEmitter);
enterFrame();
