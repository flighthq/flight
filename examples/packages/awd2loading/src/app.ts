import type { ImportDiagnostic, Mesh, Scene3DLightsLike, ShadedMaterial } from '@flighthq/sdk';
import {
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createModifierRegistry,
  createPerspectiveProjection,
  createPointLight,
  createRimModifier,
  createScene3DFromAwd2,
  createVector3,
  getNodeChildren,
  isMesh,
  isModifierStackValid,
  invalidateNodeLocalTransform,
  normalizeVector3,
  registerBuiltInModifiers,
  setQuaternionFromEuler,
  ShadedMaterialKind,
} from '@flighthq/sdk';
import {
  createOrbitCameraController,
  dollyOrbitCameraController,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/sdk/game';

import { createSyntheticAwd2 } from './createSyntheticAwd2';
import { canvas, render, scale } from './render';

const awdBytes = createSyntheticAwd2();
const diagnostics: ImportDiagnostic[] = [];
const documentScene3D = createScene3DFromAwd2(awdBytes, diagnostics);
if (diagnostics.length !== 0)
  throw new Error(`Synthetic AWD2 fixture produced diagnostics: ${diagnostics.map((d) => d.kind).join('; ')}`);
const mesh = findImportedMesh();
const material = mesh.materials[0];
if (material?.kind !== ShadedMaterialKind) throw new Error('AWD2 material did not import as ShadedMaterial');

const shadedMaterial = material as ShadedMaterial;
shadedMaterial.modifiers = [
  createRimModifier({
    color: 0x49d8ffff,
    intensity: 0.72,
    power: 2.4,
  }),
];

const modifierRegistry = createModifierRegistry();
registerBuiltInModifiers(modifierRegistry);
if (!isModifierStackValid(modifierRegistry, shadedMaterial.modifiers)) {
  throw new Error('The imported material contains an unregistered shading modifier');
}

setQuaternionFromEuler(mesh.rotation, -0.22, 0.62, 0);
invalidateNodeLocalTransform(mesh);

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;
const camera = createCamera3D({
  far: 40,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0.18,
  distance: 7,
  maxDistance: 11,
  minDistance: 4,
  polar: 0.08,
  smoothTime: 0.12,
  target: createVector3(0, 0, 0),
});
updateOrbitCameraController(cameraController, camera, 1);

const directionalDirection = createVector3(-0.65, -0.9, -0.5);
normalizeVector3(directionalDirection, directionalDirection);
const lights: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0x688bc0ff, intensity: 0.22 }),
  directional: createDirectionalLight({
    color: 0xffe2c3ff,
    direction: directionalDirection,
    intensity: 2.2,
  }),
  point: [
    createPointLight({
      color: 0x4bdcffff,
      intensity: 14,
      position: createVector3(-3.2, 2.5, 3.2),
      range: 11,
    }),
    createPointLight({
      color: 0xff6aaaff,
      intensity: 8,
      position: createVector3(3, -1.4, 2.2),
      range: 9,
    }),
  ],
};

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
    -(event.clientX - previousPointerX) * 0.006,
    (event.clientY - previousPointerY) * 0.006,
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

const details = document.createElement('section');
details.className = 'details';
details.innerHTML = [
  '<h1>AWD2 loading</h1>',
  '<p>A tiny cube is authored into an AWD2 byte stream in the browser, then loaded with <strong>createScene3DFromAwd2</strong>.</p>',
  `<p><strong>${formatBytes(awdBytes.byteLength)}</strong> · 1 mesh · 24 vertices · 1 ShadedMaterial</p>`,
  '<p class="success">✓ parsed with 0 diagnostics<br>✓ built-in rim modifier registered</p>',
  '<p>Drag to orbit · wheel to zoom</p>',
].join('');
document.body.appendChild(details);

render(documentScene3D.root, camera, lights);

const captureWindow = window as typeof window & { __flightCapture?: boolean };
let previousTime = performance.now();

function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  updateOrbitCameraController(cameraController, camera, deltaTime);
  render(documentScene3D.root, camera, lights);
  requestAnimationFrame(enterFrame);
}

if (captureWindow.__flightCapture) {
  queueCaptureFramesAfterWarmup(1);
} else {
  requestAnimationFrame(enterFrame);
}

function queueCaptureFramesAfterWarmup(framesRemaining: number): void {
  requestAnimationFrame(() => {
    if (framesRemaining > 0) {
      queueCaptureFramesAfterWarmup(framesRemaining - 1);
      return;
    }
    for (let frame = 0; frame < 32; frame++) requestAnimationFrame(() => {});
  });
}

function findImportedMesh(): Mesh {
  const child = getNodeChildren(documentScene3D.root).find(isMesh);
  if (child === undefined) throw new Error('The synthetic AWD2 scene did not contain a mesh');
  return child;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB AWD2`;
}
