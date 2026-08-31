import type {
  Bitmap,
  Camera3D,
  ParticleEmitter3D,
  ParticleEmitterConfig,
  ParticleEmitterState,
  PointLight,
  RenderEffect,
  Scene3DLightsLike,
} from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createAmbientLight,
  createBitmap,
  createBloomEffect,
  createBoxMeshGeometry,
  createCamera3D,
  createCylinderMeshGeometry,
  createImageResource,
  createMesh,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createPointLight,
  createSampler,
  createStandardPbrMaterial,
  createTexture,
  createTextureAtlas,
  createToneMapEffect,
  createTorusMeshGeometry,
  createVector3,
  createVignetteEffect,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  Node3DKind,
  prewarmParticleEmitter3D,
  setQuaternionFromEuler,
  stepParticleEmitter3D,
} from '@flighthq/sdk';
import {
  createOrbitCameraController,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/sdk/game';
import { createNode3D } from '@flighthq/sdk/scene3d';

import { render, scale } from './render';

interface ParticleLayer {
  config: ParticleEmitterConfig;
  emitter: ParticleEmitter3D;
  state: ParticleEmitterState;
}

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

function createEmberBitmap(): Bitmap {
  const bitmap = createBitmap(192, 192);
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      const offset = (y * bitmap.width + x) * 4;
      const tile = ((x >> 4) + (y >> 4)) & 1;
      const cracks = Math.abs(Math.sin(x * 0.23) + Math.cos(y * 0.19)) < 0.075;
      bitmap.data[offset] = cracks ? 91 : 28 + tile * 8;
      bitmap.data[offset + 1] = cracks ? 34 : 25 + tile * 5;
      bitmap.data[offset + 2] = cracks ? 12 : 27 + tile * 4;
      bitmap.data[offset + 3] = 255;
    }
  }
  return bitmap;
}

function createParticleAtlas(size: number, colors: readonly [string, string, string, string]) {
  const surface = document.createElement('canvas');
  surface.width = size;
  surface.height = size;
  const center = size * 0.5;
  const context = surface.getContext('2d')!;
  const gradient = context.createRadialGradient(center, center * 1.08, 1, center, center, center - 1);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.2, colors[1]);
  gradient.addColorStop(0.58, colors[2]);
  gradient.addColorStop(1, colors[3]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const atlas = createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResource(surface) }),
  });
  addTextureAtlasRegion(atlas, 0, 0, size, size);
  return atlas;
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const scene = createNode3D(Node3DKind);
const floorMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({
    sampler: createSampler({ anisotropy: 4, wrapU: 'repeat', wrapV: 'repeat' }),
    dimension: '2d',
    source: createEmberBitmap(),
  }),
  metallic: 0.05,
  roughness: 0.88,
});
const stoneMaterial = createStandardPbrMaterial({ baseColor: 0x37333dff, metallic: 0.05, roughness: 0.82 });
const ironMaterial = createStandardPbrMaterial({ baseColor: 0x25232aff, metallic: 0.82, roughness: 0.32 });
const coalMaterial = createStandardPbrMaterial({
  baseColor: 0x3b1006ff,
  emissive: 0xff4b08ff,
  emissiveStrength: 7,
  metallic: 0.1,
  roughness: 0.65,
});

const ground = createMesh(createPlaneMeshGeometry(9.6, 6.4, 10, 7), [floorMaterial]);
ground.position.y = -1.2;
invalidateNodeLocalTransform(ground);
addNodeChild(scene, ground);

const backWall = createMesh(createBoxMeshGeometry(9.2, 2.7, 0.28), [stoneMaterial]);
backWall.position.y = -0.08;
backWall.position.z = -2.65;
invalidateNodeLocalTransform(backWall);
addNodeChild(scene, backWall);

for (const x of [-4.05, -1.4, 1.4, 4.05]) {
  const pillar = createMesh(createBoxMeshGeometry(0.48, 3.2, 0.52), [stoneMaterial]);
  pillar.position.x = x;
  pillar.position.y = -0.05;
  pillar.position.z = -2.42;
  invalidateNodeLocalTransform(pillar);
  addNodeChild(scene, pillar);
}

const fireAtlas = createParticleAtlas(64, [
  'rgba(255,255,236,1)',
  'rgba(255,214,56,0.98)',
  'rgba(255,66,4,0.68)',
  'rgba(48,0,0,0)',
]);
const sparkAtlas = createParticleAtlas(20, [
  'rgba(255,255,224,1)',
  'rgba(255,184,28,0.95)',
  'rgba(238,55,4,0.58)',
  'rgba(32,0,0,0)',
]);
const flameConfig = createParticleEmitterConfig({
  alphaEnd: 0,
  alphaStart: 0.96,
  colorEndB: 0.01,
  colorEndG: 0.06,
  colorEndR: 0.68,
  colorStartB: 0.64,
  colorStartG: 0.96,
  colorStartR: 1,
  directionX: 0,
  directionY: 1,
  directionZ: 0,
  duration: 1_000_000,
  emitterConeAngle: 0.52,
  emitterRadius: 0.18,
  emitterShape: 'cone3d',
  gravityY: 0.62,
  lifetimeMax: 1.42,
  lifetimeMin: 0.62,
  loop: false,
  maxParticles: 320,
  rotationSpeedMax: 3.2,
  rotationSpeedMin: -3.2,
  scaleEnd: 0.06,
  scaleMax: 0.92,
  scaleMin: 0.34,
  spawnRate: 148,
  speedMax: 2.35,
  speedMin: 0.82,
  spread: 0.24,
});
const sparkConfig = createParticleEmitterConfig({
  alphaEnd: 0,
  alphaStart: 1,
  colorEndB: 0.01,
  colorEndG: 0.08,
  colorEndR: 0.72,
  colorStartB: 0.16,
  colorStartG: 0.82,
  colorStartR: 1,
  directionX: 0,
  directionY: 1,
  directionZ: 0,
  duration: 1_000_000,
  emitterConeAngle: 0.7,
  emitterRadius: 0.22,
  emitterShape: 'cone3d',
  gravityY: 0.24,
  lifetimeMax: 2.15,
  lifetimeMin: 0.9,
  loop: false,
  maxParticles: 120,
  rotationSpeedMax: 4.5,
  rotationSpeedMin: -4.5,
  scaleEnd: 0.025,
  scaleMax: 0.16,
  scaleMin: 0.07,
  spawnRate: 34,
  speedMax: 3.65,
  speedMin: 1.55,
  spread: 0.5,
});

const firePositions = [
  createVector3(-2.35, -0.58, -0.32),
  createVector3(0, -0.58, 0.28),
  createVector3(2.35, -0.58, -0.32),
];
const particleLayers: ParticleLayer[] = [];
const pointLights: PointLight[] = [];

for (let i = 0; i < firePositions.length; i++) {
  const position = firePositions[i];
  const size = i === 1 ? 1.28 : 0.92;

  const pedestal = createMesh(createCylinderMeshGeometry(0.42, 0.58, 0.52, 24), [stoneMaterial]);
  pedestal.position.x = position.x;
  pedestal.position.y = -0.92;
  pedestal.position.z = position.z;
  invalidateNodeLocalTransform(pedestal);
  addNodeChild(scene, pedestal);

  const brazier = createMesh(createTorusMeshGeometry(0.48, 0.11, 18, 36), [ironMaterial]);
  brazier.position.x = position.x;
  brazier.position.y = -0.63;
  brazier.position.z = position.z;
  setQuaternionFromEuler(brazier.rotation, Math.PI * 0.5, 0, 0);
  invalidateNodeLocalTransform(brazier);
  addNodeChild(scene, brazier);

  const coals = createMesh(createCylinderMeshGeometry(0.38, 0.38, 0.08, 20), [coalMaterial]);
  coals.position.x = position.x;
  coals.position.y = -0.66;
  coals.position.z = position.z;
  invalidateNodeLocalTransform(coals);
  addNodeChild(scene, coals);

  for (const [layerIndex, config, atlas] of [
    [0, flameConfig, fireAtlas],
    [1, sparkConfig, sparkAtlas],
  ] as const) {
    const emitter = createParticleEmitter3D({ blendMode: 'add' });
    emitter.data.atlas = atlas;
    emitter.position.x = position.x;
    emitter.position.y = position.y;
    emitter.position.z = position.z;
    emitter.scale.x = size;
    emitter.scale.y = size;
    emitter.scale.z = size;
    invalidateNodeLocalTransform(emitter);
    addNodeChild(scene, emitter);
    const state = createParticleEmitterState(createSeededRandom(0x51f15e + i * 7919 + layerIndex * 104729));
    prewarmParticleEmitter3D(emitter, state, config, layerIndex === 0 ? 1.1 : 1.8);
    particleLayers.push({ config, emitter, state });
  }

  pointLights.push(
    createPointLight({
      color: 0xff641cff,
      intensity: i === 1 ? 31 : 23,
      position: createVector3(position.x, position.y + 0.88, position.z + 0.05),
      range: i === 1 ? 5.4 : 4.5,
    }),
  );
}

const lights: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0x273047ff, intensity: 0.1 }),
  directional: null,
  point: pointLights,
};
const effects: readonly RenderEffect[] = [
  createBloomEffect({ intensity: 1.45, radius: 12, threshold: 0.42 }),
  createVignetteEffect({ intensity: 0.55, radius: 0.78, softness: 0.56 }),
  createToneMapEffect({ exposure: 1.1, operator: 'aces' }),
];

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4.6 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0,
  distance: 8.6,
  polar: 0.2,
  smoothTime: 0.14,
  target: createVector3(0, -0.05, -0.45),
});

let previousTime = performance.now();
const captureMode = (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true;

function enterFrame(now: number): void {
  const deltaTime = captureMode ? 1 / 60 : Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  rotateOrbitCameraController(cameraController, deltaTime * 0.018, 0);
  updateOrbitCameraController(cameraController, camera, deltaTime);

  for (const layer of particleLayers) {
    stepParticleEmitter3D(layer.emitter, layer.state, layer.config, deltaTime);
    invalidateNodeAppearance(layer.emitter);
  }
  for (let i = 0; i < pointLights.length; i++) {
    const flameLayer = particleLayers[i * 2];
    const phase = flameLayer.emitter.data.particleCount * 0.21 + flameLayer.state.spawnAccumulator * 9 + i * 1.7;
    const baseIntensity = i === 1 ? 28 : 20;
    pointLights[i].intensity = baseIntensity + Math.sin(phase) * 4 + Math.sin(phase * 2.31) * 2.2;
  }

  render(scene, camera, lights, effects);
  if (!captureMode) requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
