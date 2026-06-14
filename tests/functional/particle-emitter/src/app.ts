// Three particle demos side by side:
//   Left  (0–266px):   ParticleEmitter — steady fire column
//   Center (267–533px): ParticleEmitter — click to trigger an explosion burst
//   Right  (534–800px): updateParticleObjects — object-pool Sprites driven as particles
import {
  createParticleEmitterConfig,
  createParticleEmitterState,
  createParticleObjectsState,
  updateParticleEmitter,
  updateParticleObjects,
} from '@flighthq/particles';
import type { Sprite } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createImageSource,
  createParticleEmitter,
  createSprite,
  createTextureAtlas,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

// ---------------------------------------------------------------------------
// Procedural atlas helpers
// ---------------------------------------------------------------------------

function makeGlowCanvas(r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);
  return c;
}

function makeAtlas(r: number, g: number, b: number) {
  const atlas = createTextureAtlas({ image: createImageSource(makeGlowCanvas(r, g, b)) });
  addTextureAtlasRegion(atlas, 0, 0, 16, 16);
  return atlas;
}

// ---------------------------------------------------------------------------
// Scene root — scales from CSS-pixel space to physical pixels
// ---------------------------------------------------------------------------

const root = createSprite();
root.scaleX = scale;
root.scaleY = scale;
invalidateNodeLocalTransform(root);

// ---------------------------------------------------------------------------
// Panel A (left): fire column
// ---------------------------------------------------------------------------

const fireEmitter = createParticleEmitter();
fireEmitter.data.atlas = makeAtlas(255, 80, 0);
fireEmitter.x = 133;
fireEmitter.y = 420;
addNodeChild(root, fireEmitter);
invalidateNodeLocalTransform(fireEmitter);

const fireConfig = createParticleEmitterConfig({
  spawnRate: 120,
  lifetimeMin: 0.6,
  lifetimeMax: 1.4,
  speedMin: 40,
  speedMax: 100,
  directionX: 0,
  directionY: -1,
  spread: Math.PI / 5,
  gravityX: 0,
  gravityY: -20,
  alphaStart: 0.9,
  alphaEnd: 0,
  scaleMin: 0.5,
  scaleMax: 1.2,
  maxParticles: 500,
});
const fireState = createParticleEmitterState();

// ---------------------------------------------------------------------------
// Panel B (center): explosion burst on click
// ---------------------------------------------------------------------------

const burstEmitter = createParticleEmitter();
burstEmitter.data.atlas = makeAtlas(80, 160, 255);
burstEmitter.x = 400;
burstEmitter.y = 225;
addNodeChild(root, burstEmitter);
invalidateNodeLocalTransform(burstEmitter);

const burstConfig = createParticleEmitterConfig({
  spawnRate: 3000,
  lifetimeMin: 0.4,
  lifetimeMax: 0.9,
  speedMin: 80,
  speedMax: 200,
  spread: Math.PI * 2,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 120,
  alphaStart: 1,
  alphaEnd: 0,
  scaleMin: 0.6,
  scaleMax: 1.8,
  maxParticles: 400,
});
const idleConfig = createParticleEmitterConfig({ spawnRate: 0, maxParticles: 400 });
const burstState = createParticleEmitterState();
let burstTimer = 0;

// Seed one burst on load so the panel is not empty
burstTimer = 0.12;

// ---------------------------------------------------------------------------
// Panel C (right): updateParticleObjects driving a Sprite pool
// ---------------------------------------------------------------------------

const POOL_SIZE = 50;
const poolAtlas = makeAtlas(60, 220, 120);

const poolContainer = createSprite();
poolContainer.x = 667;
poolContainer.y = 225;
addNodeChild(root, poolContainer);
invalidateNodeLocalTransform(poolContainer);

const poolSprites: Sprite[] = Array.from({ length: POOL_SIZE }, () => {
  const s = createSprite();
  s.data.atlas = poolAtlas;
  s.data.id = 0;
  s.visible = false;
  addNodeChild(poolContainer, s);
  invalidateNodeLocalTransform(s);
  return s;
});

const poolConfig = createParticleEmitterConfig({
  spawnRate: 30,
  lifetimeMin: 0.5,
  lifetimeMax: 1.2,
  speedMin: 30,
  speedMax: 90,
  spread: Math.PI * 2,
  directionX: 0,
  directionY: -1,
  gravityX: 0,
  gravityY: 60,
  alphaStart: 1,
  alphaEnd: 0,
  scaleMin: 0.4,
  scaleMax: 1.4,
  maxParticles: POOL_SIZE,
});
const poolState = createParticleObjectsState(POOL_SIZE);

// ---------------------------------------------------------------------------
// Input: click the center panel to trigger a burst
// ---------------------------------------------------------------------------

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (800 / rect.width);
  if (cx >= 267 && cx <= 533) burstTimer = 0.12;
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // Panel A — fire
  updateParticleEmitter(fireEmitter, fireState, fireConfig, dt);
  invalidateNodeAppearance(fireEmitter);

  // Panel B — burst
  burstTimer = Math.max(0, burstTimer - dt);
  updateParticleEmitter(burstEmitter, burstState, burstTimer > 0 ? burstConfig : idleConfig, dt);
  invalidateNodeAppearance(burstEmitter);

  // Panel C — object pool
  updateParticleObjects(poolSprites, poolState, poolConfig, dt);
  for (const s of poolSprites) {
    invalidateNodeLocalTransform(s);
    invalidateNodeAppearance(s);
  }

  render(root);

  requestAnimationFrame(enterFrame);
}

enterFrame();
