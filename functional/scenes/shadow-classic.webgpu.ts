import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, drawWgpuScene3DShadowMap } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  beginWgpuFrame,
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
  createWgpuRenderStateFromCanvasElement,
  endWgpuRenderEffectPipeline,
  getNode3DWorldBounds,
  getBitmapPixelLuminance,
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
    'light-grey sphere hovering at the upper centre. A dark elliptical shadow lies on the plane ' +
    'directly beneath the sphere around 56% of the field height, while the near foreground around 90% ' +
    'height remains broadly and clearly lit. The ground is not uniformly bright, the under-sphere ' +
    'patch is more than 32 luminance levels darker than the foreground, and neither the sphere nor ' +
    'its shadow is missing or detached sideways.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, {
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

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  shadowCamera: Readonly<Camera3D>,
): void {
  prepareScene3DRender(state, scene, camera, lights);
  beginWgpuFrame(state);
  drawWgpuScene3DShadowMap(state, scene, shadowCamera, lights.directional);
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;
const material = createBlinnPhongMaterial({ diffuse: 0xb8b8b8ff, shininess: 16, specular: 0x101010ff });
const scene = createScene3D().root;

const ground = createMesh(createPlaneMeshGeometry(8, 8), [material]);
addNodeChild(scene, ground);

const sphere = createMesh(createSphereMeshGeometry(0.7, 32, 24), [material]);
setVector3(sphere.position, 0, 1.3, 0);
invalidateNodeLocalTransform(sphere);
addNodeChild(scene, sphere);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 3, 5), createVector3(0, 0.4, 0), createVector3(0, 1, 0));

const direction = createVector3(0, -1, 0);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  // Keep the classic-family witness representative: fitted camera, default single-tap filtering, and
  // zero receiver biases. Synthetic sampling-control witnesses live in shadow-sampling-controls.
  directional: createDirectionalLight({
    castsShadow: true,
    color: 0xffffffff,
    direction,
    intensity: 3,
    normalBias: 0,
    pcfRadius: 0,
    shadowBias: 0,
  }),
});
const sceneBounds = createAabb();
getNode3DWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera3D(shadowCamera, direction, sceneBounds);

render(scene, camera, lights, shadowCamera);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const litLuminance = getBitmapPixelLuminance(bitmap, cx, Math.floor(bitmap.height * 0.9));
  const shadowLuminance = getBitmapPixelLuminance(bitmap, cx, Math.floor(bitmap.height * 0.56));

  if (litLuminance <= 24) {
    throw new Error(`[shadow-classic] ground is blank (luminance ${litLuminance}) — scene did not render`);
  }
  if (shadowLuminance + 32 >= litLuminance) {
    throw new Error(
      `[shadow-classic] no shadow: ground under the sphere (${shadowLuminance}) is not clearly darker than the lit ground (${litLuminance})`,
    );
  }
}
