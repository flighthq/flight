import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, MeshMorph, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene3D,
  createScene3DLights,
  createUnlitMaterial,
  createVector3,
  createWgpuAcquisition,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DMorph,
  prepareScene3DRender,
  scene3DWgpuPipeline,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R10 G12 B16), one flat orange, screen-aligned ' +
    'quadrilateral is centred in view. Its four corners have moved from ±0.5 to ±1.1 world units, so ' +
    'it is much larger than the bind-pose quad: it covers the centre and the probe at 80% width, 80% ' +
    'height, but remains bounded and leaves the extreme frame corners near-black. The silhouette is a ' +
    'solid convex four-corner shape with no small inner square, missing corner, outline or second ' +
    'copy.',
);

// WebGPU mirror of scene-morph.webgl: the outer probe is reachable only when the CPU morph blend
// increments geometry.version and the WebGPU upload refreshes the deformed vertex buffer.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear, 'linear');
  prepareScene3DMorph(scene);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuRenderEffectPipeline(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

const corners: readonly [number, number][] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];
const stride = 12;
const vertices = new Float32Array(corners.length * stride);
const positionDeltas = new Float32Array(corners.length * 3);
for (let corner = 0; corner < corners.length; corner++) {
  const base = corner * stride;
  vertices[base] = corners[corner][0];
  vertices[base + 1] = corners[corner][1];
  vertices[base + 5] = 1;
  vertices[base + 8] = 1;
  positionDeltas[corner * 3] = Math.sign(corners[corner][0]) * 0.6;
  positionDeltas[corner * 3 + 1] = Math.sign(corners[corner][1]) * 0.6;
}
const morph: MeshMorph = {
  targets: [{ normalDeltas: null, positionDeltas, tangentDeltas: null }],
  weights: new Float32Array([1]),
};
const geometry = createMeshGeometry({
  layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
  vertices,
  indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
});
const scene = createScene3D().root;
const mesh = createMesh(geometry, [createUnlitMaterial({ baseColor: 0xff8030ff })]);
mesh.morph = morph;
addNodeChild(scene, mesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));
const direction = createVector3(-1, -0.35, -0.55);
normalizeVector3(direction, direction);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 1 }),
});
render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const covered = (x: number, y: number): boolean =>
    getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * x), Math.floor(bitmap.height * y)) > 90;
  if (!covered(0.5, 0.5)) throw new Error('[scene-morph] quad center is background');
  if (!covered(0.8, 0.8)) throw new Error('[scene-morph] outer probe is background — morph upload was skipped');
  if (covered(0.98, 0.02)) throw new Error('[scene-morph] extreme corner is covered — silhouette is not bounded');
}
