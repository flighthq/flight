import type { ImportDiagnostic, Scene3DLightsLike } from '@flighthq/sdk';
import {
  createCamera3D,
  createPerspectiveProjection,
  createPointLight,
  createRimModifier,
  createScene3DFromDocument,
  createScene3DLightsFromDocument,
  createVector3,
  getNodeChildren,
  isMesh,
  invalidateNodeLocalTransform,
  parseAwd2,
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

// Parsing stops at the format-neutral Scene3DDocument, then the document is assembled into a live scene.
// Lights are not scene members in Flight, so createScene3DLightsFromDocument separately turns the parsed
// light table into the renderer-ready draw argument used below.
const awdBytes = createSyntheticAwd2();
const diagnostics: ImportDiagnostic[] = [];
const awdDocument = parseAwd2(awdBytes, diagnostics);
const documentScene3D = createScene3DFromDocument(awdDocument);
const importedMeshes = getNodeChildren(documentScene3D.root).filter(isMesh);
for (const mesh of importedMeshes) {
  const material = mesh.materials[0];
  if (material?.kind === ShadedMaterialKind) {
    material.modifiers = [
      createRimModifier({
        color: 0x49d8ffff,
        intensity: 0.72,
        power: 2.4,
      }),
    ];
  }
  setQuaternionFromEuler(mesh.rotation, -0.22, 0.62, 0);
  invalidateNodeLocalTransform(mesh);
}

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

// The AWD file carries ONE light block, and an AWD light is a compound: a directional term plus its own
// ambient fill on the same entity. The importer splits that into the two descriptors Flight models
// separately. The bridge clones both and composes their document transforms into renderer-ready world-space
// descriptors. The two point lights stay hand-authored, showing imported and app-authored lights composing
// in one draw.
const importedLights = createScene3DLightsFromDocument(awdDocument);

const lights: Scene3DLightsLike = {
  ambient: importedLights.ambient,
  directional: importedLights.directional,
  hemisphere: importedLights.hemisphere,
  point: [
    ...(importedLights.point ?? []),
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
  spot: importedLights.spot,
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
const diagnosticSummary =
  diagnostics.length === 0
    ? '✓ parsed with 0 diagnostics'
    : `Parsed with ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}: ${diagnostics
        .map((diagnostic) => diagnostic.kind)
        .join(', ')}`;
details.innerHTML = [
  '<h1>AWD2 loading</h1>',
  '<p>A tiny cube and a light are authored into an AWD2 byte stream in the browser, then loaded with <strong>parseAwd2</strong> + <strong>createScene3DFromDocument</strong>.</p>',
  `<p><strong>${formatBytes(awdBytes.byteLength)}</strong> · ${importedMeshes.length} mesh · 24 vertices · 1 ShadedMaterial · ${awdDocument.lights.length} lights</p>`,
  `<p class="success">${diagnosticSummary}<br>✓ built-in rim modifier rendered<br>✓ key light and ambient fill imported from the file</p>`,
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

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB AWD2`;
}
