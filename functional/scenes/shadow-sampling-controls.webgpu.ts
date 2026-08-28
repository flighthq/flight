import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, drawWgpuScene3DShadowMap } from '@flighthq/scene3d-wgpu';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuFrame,
  beginWgpuRenderEffectPipeline,
  configureDirectionalShadowCamera3D,
  createAabb,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createOrthographicProjection,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createSphereMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  getNode3DWorldBounds,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerWgpuBlinnPhongMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 near-black sky frames a light-grey ground plane receding toward mid-field and a ' +
    'light-grey sphere hovering at the upper centre. A clearly dark, coarsely sampled shadow lies on ' +
    'the plane directly beneath the sphere around 56% of the field height, while the foreground ' +
    'around 90% height remains broadly lit. The shadow is not absent or replaced by uniform ground ' +
    'illumination, the sphere remains visible above it, and the rest of the field does not turn into ' +
    'a full-screen dark clear.',
);

// WebGPU mirror of the isolated GL sampling-control witness. Radius 1 must take the literal 3x3 path;
// the deliberately coarse projection and negative depth bias make both controls observable in capture.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuBlinnPhongMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, scale);

const material = createBlinnPhongMaterial({ diffuse: 0xb8b8b8ff, shininess: 16, specular: 0x101010ff });
const scene = createScene3D().root;
addNodeChild(scene, createMesh(createPlaneMeshGeometry(8, 8), [material]));

const sphere = createMesh(createSphereMeshGeometry(0.7, 32, 24), [material]);
setVector3(sphere.position, 0, 1.3, 0);
invalidateNodeLocalTransform(sphere);
addNodeChild(scene, sphere);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 3, 5), createVector3(0, 0.4, 0), createVector3(0, 1, 0));

const direction = createVector3(0, -1, 0);
const lights = {
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  directional: createDirectionalLight({
    castsShadow: true,
    color: 0xffffffff,
    direction,
    intensity: 3,
    normalBias: 0,
    pcfRadius: 1,
    shadowBias: -0.01,
  }),
};

const sceneBounds = createAabb();
getNode3DWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera3D(shadowCamera, direction, sceneBounds);
shadowCamera.projection = createOrthographicProjection({ halfHeight: 40, halfWidth: 40 });

prepareScene3DRender(state, scene, camera, lights);
beginWgpuFrame(state);
drawWgpuScene3DShadowMap(state, scene, shadowCamera, lights.directional);
renderWgpuBackground(state);
beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
drawWgpuScene3D(state, scene, camera, lights);
endWgpuRenderEffectPipeline(state, pipeline, []);
submitWgpuRenderPass(state);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const x = Math.floor(bitmap.width / 2);
  const litLuminance = getBitmapPixelLuminance(bitmap, x, Math.floor(bitmap.height * 0.9));
  const shadowLuminance = getBitmapPixelLuminance(bitmap, x, Math.floor(bitmap.height * 0.56));
  if (litLuminance <= 24) {
    throw new Error(`[shadow-sampling-controls] ground is blank (${litLuminance})`);
  }
  if (shadowLuminance + 32 >= litLuminance) {
    throw new Error(`[shadow-sampling-controls] shadow ${shadowLuminance}, lit ground ${litLuminance}`);
  }
}
