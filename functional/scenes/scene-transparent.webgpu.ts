import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field, three aligned shallow boxes overlap at the centre: opaque green ' +
    'at the back, then a half-transparent blue layer, then a half-transparent red layer nearest the ' +
    'viewer. Their common silhouette reads as one mixed-colour square in which red is dominant but ' +
    'red, green and blue are all visibly present. It is not pure green, pure blue or a set of three ' +
    'offset boxes, and the area outside the bounded square remains near-black.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerWgpuUnlitMaterial(state);

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

// Three overlapping, shallow boxes prove the WebGPU scene renderer's two-pass transparency contract.
// Scene3D order is deliberately near-transparent, opaque, far-transparent: opaque must still render
// first, then transparent surfaces must render far-to-near with depth testing on and depth writes off.
// Correct composition at center is red-dominant (near red over far blue over opaque green); drawing
// transparent scene order instead would make blue dominant.
const scene = createScene3D().root;
const geometry = createBoxMeshGeometry(2.4, 2.4, 0.08);

const nearRed = createUnlitMaterial({ baseColor: 0xff000080 });
nearRed.alphaMode = 'blend';
const nearMesh = createMesh(geometry, [nearRed]);
nearMesh.position.z = 0.6;
invalidateNodeLocalTransform(nearMesh);
addNodeChild(scene, nearMesh);

const opaqueGreen = createUnlitMaterial({ baseColor: 0x00ff00ff });
const opaqueMesh = createMesh(geometry, [opaqueGreen]);
opaqueMesh.position.z = 0;
invalidateNodeLocalTransform(opaqueMesh);
addNodeChild(scene, opaqueMesh);

const farBlue = createUnlitMaterial({ baseColor: 0x0000ff80 });
farBlue.alphaMode = 'blend';
const farMesh = createMesh(geometry, [farBlue]);
farMesh.position.z = 0.3;
invalidateNodeLocalTransform(farMesh);
addNodeChild(scene, farMesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, 0, -1), intensity: 0 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const rgb = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2));
  const red = (rgb >> 16) & 0xff;
  const green = (rgb >> 8) & 0xff;
  const blue = rgb & 0xff;

  if (red < 40 || green < 20 || blue < 20) {
    throw new Error(`[scene-transparent] expected all three layers at center, got rgb(${red}, ${green}, ${blue})`);
  }
  if (red <= blue + 20) {
    throw new Error(
      `[scene-transparent] near red did not composite last over far blue, got rgb(${red}, ${green}, ${blue})`,
    );
  }
}
