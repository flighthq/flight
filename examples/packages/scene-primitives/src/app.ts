import {
  createOrbitCameraController,
  dollyCameraController,
  orbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createSceneNode } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createSampler,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createSurface,
  createTexture,
  createTorusMeshGeometry,
  createVector3,
  invalidateNodeLocalTransform,
  normalizeVector3,
  SceneNodeKind,
  setQuaternionFromEuler,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

const checkerSurface = createSurface(128, 128);
const checkerData = checkerSurface.data;
for (let y = 0; y < checkerSurface.height; y++) {
  for (let x = 0; x < checkerSurface.width; x++) {
    const offset = (y * checkerSurface.width + x) * 4;
    const light = ((x >> 4) + (y >> 4)) % 2 === 0;
    checkerData[offset] = light ? 238 : 32;
    checkerData[offset + 1] = light ? 166 : 88;
    checkerData[offset + 2] = light ? 64 : 150;
    checkerData[offset + 3] = 255;
  }
}

const checkerTexture = createTexture({
  image: checkerSurface,
  sampler: createSampler({ anisotropy: 4, wrapU: 'repeat', wrapV: 'repeat' }),
});
const groundMaterial = createStandardPbrMaterial({
  baseColor: 0x202735ff,
  metallic: 0,
  roughness: 0.82,
});
const cubeMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: checkerTexture,
  metallic: 0.08,
  roughness: 0.35,
});
const torusMaterial = createStandardPbrMaterial({
  baseColor: 0x34c9b6ff,
  doubleSided: true,
  metallic: 0.65,
  roughness: 0.24,
});
const sphereMaterial = createStandardPbrMaterial({
  baseColor: 0x6f83ffff,
  metallic: 0,
  roughness: 0.3,
});

const scene = createSceneNode(SceneNodeKind);

const ground = createMesh(createPlaneMeshGeometry(8, 6, 8, 6), [groundMaterial]);
ground.position.y = -1.35;
invalidateNodeLocalTransform(ground);
addNodeChild(scene, ground);

const cube = createMesh(createBoxMeshGeometry(1.55, 1.55, 1.55), [cubeMaterial]);
cube.position.x = -2.25;
cube.position.y = -0.5;
invalidateNodeLocalTransform(cube);
addNodeChild(scene, cube);

const torus = createMesh(createTorusMeshGeometry(1, 0.34, 28, 52), [torusMaterial]);
torus.position.y = -0.05;
invalidateNodeLocalTransform(torus);
addNodeChild(scene, torus);

const sphere = createMesh(createSphereMeshGeometry(0.9, 48, 32), [sphereMaterial]);
sphere.position.x = 2.35;
sphere.position.y = -0.2;
invalidateNodeLocalTransform(sphere);
addNodeChild(scene, sphere);

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0,
  distance: 9.5,
  maxDistance: 14,
  minDistance: 5,
  polar: 0.28,
  smoothTime: 0.12,
  target: createVector3(0, -0.15, 0),
});

const directionalDirection = createVector3(-0.7, -1, -0.45);
normalizeVector3(directionalDirection, directionalDirection);
const lights: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0x7184aaff, intensity: 0.32 }),
  directional: createDirectionalLight({
    color: 0xfff1dcff,
    direction: directionalDirection,
    intensity: 3.4,
  }),
};

let dragging = false;
let previousPointerX = 0;
let previousPointerY = 0;
let previousTime = performance.now();
let cubeRotation = 0;
let sphereRotation = 0;
let torusRotation = 0;

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  dragging = true;
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event: PointerEvent) => {
  if (!dragging) return;
  orbitCameraController(
    cameraController,
    -(event.clientX - previousPointerX) * 0.008,
    (event.clientY - previousPointerY) * 0.008,
  );
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
});

canvas.addEventListener('pointerup', (event: PointerEvent) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    event.preventDefault();
    dollyCameraController(cameraController, event.deltaY * 0.006);
  },
  { passive: false },
);

function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  if (!dragging) orbitCameraController(cameraController, deltaTime * 0.12, 0);
  updateOrbitCameraController(cameraController, camera, deltaTime);

  cubeRotation += deltaTime * 0.48;
  setQuaternionFromEuler(cube.rotation, cubeRotation * 0.65, cubeRotation, 0);
  invalidateNodeLocalTransform(cube);

  torusRotation += deltaTime * 0.38;
  setQuaternionFromEuler(torus.rotation, Math.PI * 0.38, 0, torusRotation);
  invalidateNodeLocalTransform(torus);

  sphereRotation -= deltaTime * 0.24;
  setQuaternionFromEuler(sphere.rotation, 0, sphereRotation, 0);
  invalidateNodeLocalTransform(sphere);

  render(scene, camera, lights);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
