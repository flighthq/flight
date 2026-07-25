import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, drawWgpuScene3DShadowMap } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
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
  createWgpuRenderState,
  getNode3DWorldBounds,
  getSurfacePixelLuminance,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerBlinnPhongWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerBlinnPhongWgpuMaterial(state);

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
  beginWgpuFrame(state);
  drawWgpuScene3DShadowMap(state, scene, shadowCamera);
  renderWgpuBackground(state);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
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
const lights = {
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 3 }),
};
const sceneBounds = createAabb();
getNode3DWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera3D(shadowCamera, direction, sceneBounds);

render(scene, camera, lights, shadowCamera);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const litLuminance = getSurfacePixelLuminance(surface, cx, Math.floor(surface.height * 0.9));
  const shadowLuminance = getSurfacePixelLuminance(surface, cx, Math.floor(surface.height * 0.56));

  if (litLuminance <= 24) {
    throw new Error(`[shadow-classic] ground is blank (luminance ${litLuminance}) — scene did not render`);
  }
  if (shadowLuminance + 32 >= litLuminance) {
    throw new Error(
      `[shadow-classic] no shadow: ground under the sphere (${shadowLuminance}) is not clearly darker than the lit ground (${litLuminance})`,
    );
  }
}
