import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createMesh,
  createPerspectiveProjection,
  createPointLight,
  createScene3DLights,
  createSphereMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  prepareScene3DRender,
  registerWgpuBlinnPhongMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single grey sphere centred in it, about a fifth ' +
    'of the frame height across. It is lit FROM ONE SIDE BY A NEARBY LAMP: the right of the sphere is ' +
    'clearly brighter than the left, with a smooth falloff between them and a small bright highlight on ' +
    'the lit side. A uniformly lit sphere, or one whose left side is the brighter, is the failure — the ' +
    'lit half must be measurably lighter than the shadowed half, not merely different. The background ' +
    'stays near-black and is not lit up by the lamp.',
);
// WebGPU parity column for the WebGL point-light scene. A mid-gray sphere is illuminated from a
// position up-front-right; the assertion distinguishes positional punctual shading from a flat fill.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuBlinnPhongMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const logicalWidth = width / scale;
const logicalHeight = height / scale;
const geometry = createSphereMeshGeometry(0.5, 48, 32);
const material = createBlinnPhongMaterial({ diffuse: 0x808080ff, specular: 0x808080ff, shininess: 32 });
const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  point: [createPointLight({ color: 0xffffffff, intensity: 5, position: createVector3(1.2, 0.4, 1.2), range: -1 })],
});
render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.075);
  const litLuminance = getBitmapPixelLuminance(bitmap, cx + offset, cy);
  const shadowLuminance = getBitmapPixelLuminance(bitmap, cx - offset, cy);

  if (litLuminance <= 24) {
    throw new Error(`[light-point] lit side is blank (luminance ${litLuminance}) — point light did not shade the mesh`);
  }
  if (litLuminance <= shadowLuminance + 24) {
    throw new Error(
      `[light-point] no point shading: lit side (${litLuminance}) is not clearly brighter than shadow side (${shadowLuminance})`,
    );
  }
}
