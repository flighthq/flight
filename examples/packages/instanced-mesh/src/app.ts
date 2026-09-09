import type { Camera3D, Scene3DLightsLike } from '@flighthq/sdk';
import {
  addNodeChild,
  appendInstancedMeshInstance,
  configureDirectionalShadowCamera3D,
  createAabb,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createInstancedMesh,
  createMatrix4,
  createMesh,
  createOrbitCameraController,
  createOrthographicProjection,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  dollyOrbitCameraController,
  invalidateNodeLocalTransform,
  Node3DKind,
  normalizeVector3,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/sdk';
import { createNode3D } from '@flighthq/sdk/scene3d';

import { canvas, render, scale } from './render';

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

const scene = createNode3D(Node3DKind);

// A non-instanced ground plane to confirm regular mesh rendering works alongside instancing.
const ground = createMesh(createPlaneMeshGeometry(12, 8, 12, 8), [
  createStandardPbrMaterial({ baseColor: 0x182235ff, metallic: 0, roughness: 0.86 }),
]);
ground.position.y = -0.5;
invalidateNodeLocalTransform(ground);
addNodeChild(scene, ground);

// A single InstancedMesh: one box geometry drawn 25 times in a 5x5 grid.
const boxGeometry = createBoxMeshGeometry(0.6, 0.6, 0.6);
const instancedBoxes = createInstancedMesh(boxGeometry, [
  createStandardPbrMaterial({ baseColor: 0xcc5533ff, metallic: 0, roughness: 0.4 }),
]);
addNodeChild(scene, instancedBoxes);

const instanceMatrix = createMatrix4();
for (let row = 0; row < 5; row++) {
  for (let col = 0; col < 5; col++) {
    instanceMatrix.m[12] = (col - 2) * 1.5;
    instanceMatrix.m[13] = 0;
    instanceMatrix.m[14] = (row - 2) * 1.5;
    appendInstancedMeshInstance(instancedBoxes, instanceMatrix);
  }
}

const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});

const cameraController = createOrbitCameraController({
  azimuth: 0.68,
  distance: 10,
  polar: 0.5,
  smoothTime: 0.12,
  target: createVector3(0, 0, 0),
});

const directionalDirection = createVector3(-1, -0.5, -0.7);
normalizeVector3(directionalDirection, directionalDirection);
const directionalLight = createDirectionalLight({
  castsShadow: true,
  color: 0xffe3c4ff,
  direction: directionalDirection,
  intensity: 3,
  normalBias: 0.75,
  pcfRadius: 1,
  shadowBias: 0.001,
});
const lights: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0x607090ff, intensity: 0.3 }),
  directional: directionalLight,
};

const shadowCamera = createCamera3D({
  far: 20,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 6, halfWidth: 6 }),
});
configureDirectionalShadowCamera3D(shadowCamera, directionalDirection, createAabb(-5, -1, -5, 5, 2, 5));

let dragging = false;
let previousPointerX = 0;
let previousPointerY = 0;

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  dragging = true;
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event: PointerEvent) => {
  if (!dragging) return;
  rotateOrbitCameraController(
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
    dollyOrbitCameraController(cameraController, event.deltaY * 0.006);
  },
  { passive: false },
);

updateOrbitCameraController(cameraController, camera, 1);
render(scene, camera, lights, shadowCamera);

let previousTime = performance.now();
function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  updateOrbitCameraController(cameraController, camera, deltaTime);
  render(scene, camera, lights, shadowCamera);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
