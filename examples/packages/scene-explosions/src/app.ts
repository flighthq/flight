import {
  createOrbitCameraController,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createNode3D } from '@flighthq/scene3d';
import type {
  Camera3D,
  ParticleEmitter3D,
  ParticleEmitterConfig,
  ParticleEmitterState,
  Scene3DLightsLike,
  Bitmap,
} from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createCamera3D,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createPerspectiveProjection,
  createBitmap,
  createVector3,
  emitParticleBurst3D,
  invalidateNodeAppearance,
  prewarmParticleEmitter3D,
  Node3DKind,
  stepParticleEmitter3D,
} from '@flighthq/sdk';

import { render, scale } from './render';

interface SampledPixel {
  b: number;
  g: number;
  r: number;
  x: number;
  y: number;
}

interface BurstEmitter {
  config: ParticleEmitterConfig;
  emitter: ParticleEmitter3D;
  pixels: SampledPixel[];
  state: ParticleEmitterState;
  x: number;
}

const IMAGE_SIZE = 40;
const PIXEL_SCALE = 0.055;
const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

function writeBitmapPixel(bitmap: Bitmap, x: number, y: number, r: number, g: number, b: number): void {
  const offset = (y * bitmap.width + x) * 4;
  bitmap.data[offset] = r;
  bitmap.data[offset + 1] = g;
  bitmap.data[offset + 2] = b;
  bitmap.data[offset + 3] = 255;
}

function createSymbolBitmap(kind: number): Bitmap {
  const bitmap = createBitmap(IMAGE_SIZE, IMAGE_SIZE);
  const center = (IMAGE_SIZE - 1) / 2;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      const dx = x - center;
      const dy = y - center;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      let filled = false;

      if (kind === 0) {
        const spiralRadius = 7.5 + angle * 1.45;
        filled = radius < 5 || Math.abs(radius - spiralRadius) < 2.5 || (radius > 12 && radius < 16);
      } else if (kind === 1) {
        const diamond = Math.abs(dx) + Math.abs(dy);
        filled = diamond < 16 && (diamond > 8 || Math.abs(dx) < 3 || Math.abs(dy) < 3);
      } else {
        const starEdge = 7 + 7 * Math.abs(Math.cos(angle * 3));
        filled = radius < starEdge || (radius > 13 && radius < 16 && Math.abs(Math.sin(angle * 3)) > 0.72);
      }

      if (!filled) continue;
      const glow = Math.max(0, 1 - radius / 24);
      if (kind === 0) {
        writeBitmapPixel(bitmap, x, y, 255, 82 + glow * 150, 22 + glow * 40);
      } else if (kind === 1) {
        writeBitmapPixel(bitmap, x, y, 35 + glow * 75, 130 + glow * 110, 255);
      } else {
        writeBitmapPixel(bitmap, x, y, 70 + glow * 80, 255, 110 + glow * 95);
      }
    }
  }
  return bitmap;
}

function sampleBitmapPixels(bitmap: Readonly<Bitmap>): SampledPixel[] {
  const pixels: SampledPixel[] = [];
  const centerX = (bitmap.width - 1) / 2;
  const centerY = (bitmap.height - 1) / 2;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      const offset = (y * bitmap.width + x) * 4;
      if (bitmap.data[offset + 3] < 176) continue;
      pixels.push({
        b: bitmap.data[offset + 2],
        g: bitmap.data[offset + 1],
        r: bitmap.data[offset],
        x: (x - centerX) * PIXEL_SCALE,
        y: (centerY - y) * PIXEL_SCALE,
      });
    }
  }
  return pixels;
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function emitSampledImage(burst: BurstEmitter): void {
  for (let i = 0; i < burst.pixels.length; i++) {
    const pixel = burst.pixels[i];
    const tint = ((pixel.r << 24) | (pixel.g << 16) | (pixel.b << 8) | 0xff) >>> 0;
    emitParticleBurst3D(burst.emitter, burst.state, burst.config, 1, burst.x + pixel.x, pixel.y, 0, tint);
  }
  invalidateNodeAppearance(burst.emitter);
}

const scene = createNode3D(Node3DKind);
const burstEmitters: BurstEmitter[] = [];
const burstPositions = [-2.25, 0, 2.25];

for (let i = 0; i < burstPositions.length; i++) {
  const pixels = sampleBitmapPixels(createSymbolBitmap(i));
  const config = createParticleEmitterConfig({
    alphaEnd: 0,
    alphaStart: 1,
    lifetimeMax: 2.9,
    lifetimeMin: 2.9,
    maxParticles: pixels.length,
    rotationSpeedMax: 3,
    rotationSpeedMin: -3,
    scaleEnd: 0.18,
    scaleMax: 0.05,
    scaleMin: 0.05,
    spawnRate: 0,
    speedMax: 0.72,
    speedMin: 0.12,
    emitterShape: 'sphere',
  });
  const emitter = createParticleEmitter3D({ blendMode: 'add' });
  const state = createParticleEmitterState(createSeededRandom(0x99173 + i * 1777));
  addNodeChild(scene, emitter);
  const burst: BurstEmitter = { config, emitter, pixels, state, x: burstPositions[i] };
  emitSampledImage(burst);
  prewarmParticleEmitter3D(emitter, state, config, 0.04 + i * 0.17);
  burstEmitters.push(burst);
}

const lights: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0x8899c0ff, intensity: 0.18 }),
  directional: null,
  point: [],
};
const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0,
  distance: 7.5,
  polar: 0.04,
  smoothTime: 0.16,
  target: createVector3(0, 0, 0),
});

let previousTime = performance.now();
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

function enterFrame(now: number): void {
  const deltaTime = captureMode ? 1 / 60 : Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  rotateOrbitCameraController(cameraController, deltaTime * 0.055, 0);
  updateOrbitCameraController(cameraController, camera, deltaTime);

  for (let i = 0; i < burstEmitters.length; i++) {
    const burst = burstEmitters[i];
    stepParticleEmitter3D(burst.emitter, burst.state, burst.config, deltaTime);
    if (burst.emitter.data.particleCount === 0) emitSampledImage(burst);
    invalidateNodeAppearance(burst.emitter);
  }

  render(scene, camera, lights);
  if (!captureMode) requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
