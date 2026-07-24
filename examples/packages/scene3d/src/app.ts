import { createSceneNode } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike } from '@flighthq/sdk';
import {
  addNodeChild,
  configureDirectionalShadowCamera3D,
  createAmbientLight,
  createAabb,
  createBoxMeshGeometry,
  createCamera3D,
  createConeMeshGeometry,
  createDirectionalLight,
  createMesh,
  createOrbitCameraController,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createPointLight,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  dollyOrbitCameraController,
  invalidateNodeLocalTransform,
  normalizeVector3,
  rotateOrbitCameraController,
  SceneNodeKind,
  updateOrbitCameraController,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

// The scene root is a bare SceneNode (createScene now allocates a Scene *document* that owns a root);
// createSceneNode is imported from @flighthq/scene directly to sidestep the @flighthq/sdk barrel.

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;

// Three procedural mesh primitives arranged above a shared shadow receiver.
const boxGeometry = createBoxMeshGeometry(1, 1, 1);
const sphereGeometry = createSphereMeshGeometry(0.5, 48, 32);
const coneGeometry = createConeMeshGeometry(0.5, 1, 32);

// Each mesh has a distinct StandardPbr material: warm red dielectric, gray metallic, cool blue dielectric.
const redMaterial = createStandardPbrMaterial({
  baseColor: 0xcc3333ff,
  metallic: 0,
  roughness: 0.4,
});

const grayMetallicMaterial = createStandardPbrMaterial({
  baseColor: 0xaaaaaaff,
  metallic: 1,
  roughness: 0.3,
});

const blueMaterial = createStandardPbrMaterial({
  baseColor: 0x3366ccff,
  metallic: 0,
  roughness: 0.5,
});

const scene = createSceneNode(SceneNodeKind);

const ground = createMesh(createPlaneMeshGeometry(7, 5, 7, 5), [
  createStandardPbrMaterial({
    baseColor: 0x182235ff,
    metallic: 0,
    roughness: 0.86,
  }),
]);
ground.position.y = -0.75;
invalidateNodeLocalTransform(ground);
addNodeChild(scene, ground);

const boxMesh = createMesh(boxGeometry, [redMaterial]);
// A node's transform is authored via its `position`/`rotation`/`scale` fields; invalidate after editing.
boxMesh.position.x = -2;
boxMesh.position.y = -0.25;
invalidateNodeLocalTransform(boxMesh);
addNodeChild(scene, boxMesh);

const sphereMesh = createMesh(sphereGeometry, [grayMetallicMaterial]);
sphereMesh.position.y = -0.25;
invalidateNodeLocalTransform(sphereMesh);
addNodeChild(scene, sphereMesh);

const coneMesh = createMesh(coneGeometry, [blueMaterial]);
coneMesh.position.x = 2;
coneMesh.position.y = -0.25;
invalidateNodeLocalTransform(coneMesh);
addNodeChild(scene, coneMesh);

// Perspective camera viewing the scene from a 3/4 angle.
const camera: Camera3D = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});

const cameraController = createOrbitCameraController({
  azimuth: 0.68,
  distance: 7,
  polar: 0.38,
  smoothTime: 0.12,
  target: createVector3(0, -0.25, 0),
});

// A shadow-casting sun supplies the key light. The point light adds a cool local highlight while
// ambient light keeps the shadowed faces legible.
const directionalDirection = createVector3(-1, -0.5, -0.7);
normalizeVector3(directionalDirection, directionalDirection);
const directionalLight = createDirectionalLight({
  castsShadow: true,
  color: 0xffe3c4ff,
  direction: directionalDirection,
  intensity: 3,
  normalBias: 0.003,
  pcfRadius: 1,
  shadowBias: 0.001,
});
const lights: SceneLightsLike = {
  ambient: createAmbientLight({ color: 0x607090ff, intensity: 0.2 }),
  directional: directionalLight,
  point: [
    createPointLight({
      color: 0x5ea8ffff,
      intensity: 8,
      position: createVector3(1.8, 1.6, 2),
      range: 7,
    }),
  ],
};

const shadowCamera = createCamera3D({
  far: 20,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 4, halfWidth: 4 }),
});
configureDirectionalShadowCamera3D(shadowCamera, directionalDirection, createAabb(-3.5, -0.8, -2.5, 3.5, 1, 2.5));

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
