import { createScene } from '@flighthq/scene';
import { drawWgpuScene, drawWgpuSceneShadowMap } from '@flighthq/scene-wgpu';
import type { Camera, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  configureDirectionalShadowCamera,
  createAabb,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera,
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
  getSceneNodeWorldBounds,
  getSurfacePixelLuminance,
  prepareSceneRender,
  registerBlinnPhongWgpuMaterial,
  renderWgpuBackground,
  setCameraViewMatrix4FromLookAt,
  setSceneNodePosition,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// shadow-classic (wgpu column) — the WebGPU parity for shadow-classic.webgl: a Blinn-Phong sphere over a
// Blinn-Phong ground under one straight-down sun, the ground under the sphere darkened by the directional
// shadow map the classic prelude now PCF-samples on group(3). This is the scene that actually exercises the
// new wgpu classic shadow bind group end to end (the shadow depth pass runs on the open encoder before the
// forward pass, in one submit). drawWgpuScene / createScene collide in the barrel — import them directly.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerBlinnPhongWgpuMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLights>,
  shadowCamera: Readonly<Camera>,
): void {
  renderWgpuBackground(state);
  prepareSceneRender(state, scene, camera, lights);
  // Depth pass on the open encoder BEFORE the forward render pass opens (same submit).
  drawWgpuSceneShadowMap(state, scene, shadowCamera);
  beginWgpuRenderEffectPipeline(state, pipeline);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const material = createBlinnPhongMaterial({ diffuse: 0xb8b8b8ff, shininess: 16, specular: 0x101010ff });

const scene = createScene();

const ground = createMesh(createPlaneMeshGeometry(8, 8), [material]);
addNodeChild(scene, ground);

const sphere = createMesh(createSphereMeshGeometry(0.7, 32, 24), [material]);
setSceneNodePosition(sphere, 0, 1.3, 0);
addNodeChild(scene, sphere);

const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 3, 5), createVector3(0, 0.4, 0), createVector3(0, 1, 0));

const direction = createVector3(0, -1, 0);
const lights = {
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 3 }),
};

const sceneBounds = createAabb();
getSceneNodeWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera(shadowCamera, direction, sceneBounds);

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
      `[shadow-classic] no shadow: ground under the sphere (${shadowLuminance}) is not clearly darker than the lit ground (${litLuminance}) — classic material did not receive the shadow`,
    );
  }
}
