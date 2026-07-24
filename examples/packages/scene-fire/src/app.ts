import {
  createOrbitCameraController,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createSceneNode } from '@flighthq/scene';
import type {
  Camera3D,
  ParticleEmitter3D,
  ParticleEmitterState,
  PointLight,
  SceneLightsLike,
  Surface,
} from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createAmbientLight,
  createCamera3D,
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
  createSurface,
  createTexture,
  createTextureAtlas,
  createVector3,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  prewarmParticleEmitter3D,
  SceneNodeKind,
  stepParticleEmitter3D,
} from '@flighthq/sdk';

import { render, scale } from './render';

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

function createEmberSurface(): Surface {
  const surface = createSurface(192, 192);
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const offset = (y * surface.width + x) * 4;
      const tile = ((x >> 4) + (y >> 4)) & 1;
      const cracks = Math.abs(Math.sin(x * 0.23) + Math.cos(y * 0.19)) < 0.075;
      surface.data[offset] = cracks ? 91 : 28 + tile * 8;
      surface.data[offset + 1] = cracks ? 34 : 25 + tile * 5;
      surface.data[offset + 2] = cracks ? 12 : 27 + tile * 4;
      surface.data[offset + 3] = 255;
    }
  }
  return surface;
}

function createFireAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(24, 27, 1, 24, 24, 23);
  gradient.addColorStop(0, 'rgba(255, 255, 220, 1)');
  gradient.addColorStop(0.18, 'rgba(255, 224, 80, 1)');
  gradient.addColorStop(0.48, 'rgba(255, 92, 8, 0.82)');
  gradient.addColorStop(0.75, 'rgba(170, 20, 2, 0.35)');
  gradient.addColorStop(1, 'rgba(32, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const atlas = createTextureAtlas({ image: createImageResource(canvas) });
  addTextureAtlasRegion(atlas, 0, 0, canvas.width, canvas.height);
  return atlas;
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const scene = createSceneNode(SceneNodeKind);
const groundTexture = createTexture({
  image: createEmberSurface(),
  sampler: createSampler({ anisotropy: 4, wrapU: 'repeat', wrapV: 'repeat' }),
});
const ground = createMesh(createPlaneMeshGeometry(8.5, 5.5, 8, 5), [
  createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: groundTexture,
    metallic: 0.05,
    roughness: 0.88,
  }),
]);
ground.position.y = -1.2;
invalidateNodeLocalTransform(ground);
addNodeChild(scene, ground);

const fireAtlas = createFireAtlas();
const fireConfig = createParticleEmitterConfig({
  alphaEnd: 0,
  alphaStart: 0.92,
  colorEndB: 0.01,
  colorEndG: 0.08,
  colorEndR: 0.75,
  colorStartB: 0.52,
  colorStartG: 0.92,
  colorStartR: 1,
  directionX: 0,
  directionY: 1,
  directionZ: 0,
  duration: 1_000_000,
  emitterConeAngle: 0.55,
  emitterRadius: 0.13,
  emitterShape: 'cone3d',
  gravityY: 0.45,
  lifetimeMax: 1.18,
  lifetimeMin: 0.58,
  loop: false,
  maxParticles: 160,
  rotationSpeedMax: 2.4,
  rotationSpeedMin: -2.4,
  scaleEnd: 0.08,
  scaleMax: 0.74,
  scaleMin: 0.32,
  spawnRate: 74,
  speedMax: 2.05,
  speedMin: 0.78,
  spread: 0.2,
});

const firePositions = [
  createVector3(-2.25, -1.08, -0.35),
  createVector3(0, -1.08, 0.35),
  createVector3(2.25, -1.08, -0.35),
];
const emitters: ParticleEmitter3D[] = [];
const emitterStates: ParticleEmitterState[] = [];
const pointLights: PointLight[] = [];

for (let i = 0; i < firePositions.length; i++) {
  const position = firePositions[i];
  const emitter = createParticleEmitter3D({ blendMode: 'add' });
  emitter.data.atlas = fireAtlas;
  emitter.position.x = position.x;
  emitter.position.y = position.y;
  emitter.position.z = position.z;
  invalidateNodeLocalTransform(emitter);
  addNodeChild(scene, emitter);
  emitters.push(emitter);
  const emitterState = createParticleEmitterState(createSeededRandom(0x51f15e + i * 7919));
  prewarmParticleEmitter3D(emitter, emitterState, fireConfig, 0.75);
  emitterStates.push(emitterState);
  pointLights.push(
    createPointLight({
      color: 0xff5d18ff,
      intensity: 18,
      position: createVector3(position.x, position.y + 0.68, position.z + 0.05),
      range: 4.2,
    }),
  );
}

const lights: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0x352b42ff, intensity: 0.24 }),
  directional: null,
  point: pointLights,
};

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4.5 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0,
  distance: 8.2,
  polar: 0.24,
  smoothTime: 0.14,
  target: createVector3(0, -0.15, 0),
});

let previousTime = performance.now();

function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  rotateOrbitCameraController(cameraController, deltaTime * 0.025, 0);
  updateOrbitCameraController(cameraController, camera, deltaTime);

  for (let i = 0; i < emitters.length; i++) {
    const emitter = emitters[i];
    const emitterState = emitterStates[i];
    stepParticleEmitter3D(emitter, emitterState, fireConfig, deltaTime);
    invalidateNodeAppearance(emitter);

    const statePhase = emitter.data.particleCount * 0.37 + emitterState.spawnAccumulator * 8 + i * 2.1;
    const flicker = Math.sin(statePhase) * 4.8 + Math.sin(statePhase * 2.37) * 2.4;
    pointLights[i].intensity = 12 + emitter.data.particleCount * 0.14 + flicker;
  }

  render(scene, camera, lights);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
