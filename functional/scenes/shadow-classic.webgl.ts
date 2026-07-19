import { createScene } from '@flighthq/scene';
import { drawGlScene, drawGlSceneShadowMap } from '@flighthq/scene-gl';
import type { Camera, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  configureDirectionalShadowCamera,
  createAabb,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getSceneNodeWorldBounds,
  getSurfacePixelLuminance,
  prepareSceneRender,
  registerBlinnPhongGlMaterial,
  renderGlBackground,
  setCameraViewMatrix4FromLookAt,
  setSceneNodePosition,
} from '@flighthq/sdk';

// shadow-classic — proves the directional shadow map is RECEIVED by the classic (Blinn-Phong) material
// family, not just PBR: the same sphere-over-plane recipe as shadow-directional but shaded with
// createBlinnPhongMaterial. Before the classic prelude sampled sampleDirectionalShadow on its directional
// term, this ground would light uniformly; now the ground under the sphere is darkened like the PBR case.
// This is the exact family the downstream scene used (metals render black without IBL, so it fell back to
// Blinn-Phong) — the reason classic shadow reception was wired.
//
// webgl-only: the wgpu classic/toon preludes DO sample the shadow map (group(3)), but the wgpu directional
// shadow *depth pass* is not runnable today — renderWgpuBackground creates the command encoder and opens
// the main render pass atomically, so drawWgpuSceneShadowMap can never get the "encoder with no open pass"
// it requires (WebGPU errors "encoder locked while a RenderPassEncoder is open"). That is a pre-existing
// render-wgpu frame-API gap affecting the PBR shadow path too — see agents/wgpu-3d-parity-spec.md.
//
// createScene / drawGlScene collide in the @flighthq/sdk barrel (both scene + scene-gl re-export them) —
// import the Gl 3D ones directly. Pipeline wiring mirrors shadow-directional.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerBlinnPhongGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
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
  // 1) Depth pass from the light's POV into the shadow map.
  drawGlSceneShadowMap(state, scene, shadowCamera);

  // 2) Forward-lit pass; the classic prelude's directional term PCF-samples the shadow map set above.
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareSceneRender(state, scene, camera, lights);
  drawGlScene(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Diffuse-dominant Blinn-Phong (low specular) so the lit ground is a broad even bright the shadow darkens.
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
  // Same sampling geometry as shadow-directional: lit ground in the near foreground (90% height) vs the
  // shadowed ground directly under the sphere (~56% height). Classic reception darkens the latter.
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
