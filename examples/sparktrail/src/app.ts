import { createParticleEmitterConfig, createParticleEmitterState, updateParticleEmitter } from '@flighthq/particles';
import {
  addTextureAtlasRegion,
  createImageSource,
  createParticleEmitter,
  createTextureAtlas,
  invalidateAppearance,
  invalidateLocalTransform,
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
const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
grad.addColorStop(0, 'rgba(255, 255, 200, 1)');
grad.addColorStop(0.3, 'rgba(255, 120, 0, 0.9)');
grad.addColorStop(1, 'rgba(180, 0, 0, 0)');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, 16, 16);

const atlas = createTextureAtlas({ image: createImageSource(sparkCanvas) });
addTextureAtlasRegion(atlas, 0, 0, 16, 16);

const emitter = createParticleEmitter();
emitter.data.atlas = atlas;
emitter.scaleX = scale;
emitter.scaleY = scale;
emitter.x = (WIDTH * scale) / 2;
emitter.y = (HEIGHT * scale) / 2;

const config = createParticleEmitterConfig({
  spawnRate: 250,
  lifetimeMin: 0.2,
  lifetimeMax: 0.55,
  speedMin: 40,
  speedMax: 130,
  spread: Math.PI * 2,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 200,
  alphaStart: 1,
  alphaEnd: 0,
  scaleMin: 0.4,
  scaleMax: 1.4,
  maxParticles: 3000,
});

const configPressed = createParticleEmitterConfig({
  spawnRate: 1500,
  lifetimeMin: 0.3,
  lifetimeMax: 0.8,
  speedMin: 100,
  speedMax: 350,
  spread: Math.PI * 2,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 300,
  alphaStart: 1,
  alphaEnd: 0,
  scaleMin: 0.6,
  scaleMax: 2.0,
  maxParticles: 3000,
});

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
  invalidateLocalTransform(emitter);

  updateParticleEmitter(emitter, simState, pointerDown ? configPressed : config, dt);
  invalidateAppearance(emitter);

  counter.textContent = `${emitter.data.particleCount} particles`;

  render(emitter);

  stats.end();
  requestAnimationFrame(enterFrame);
}

invalidateLocalTransform(emitter);
enterFrame();
