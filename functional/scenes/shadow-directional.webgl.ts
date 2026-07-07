import { createScene } from '@flighthq/scene';
import { drawGlScene, drawGlSceneShadowMap } from '@flighthq/scene-gl';
import type { Camera, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  configureDirectionalShadowCamera,
  createAabb,
  createAmbientLight,
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
  createStandardPbrMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getSceneNodeWorldBounds,
  getSurfacePixelLuminance,
  prepareSceneRender,
  registerStandardPbrGlMaterial,
  renderGlBackground,
  setCameraViewMatrix4FromLookAt,
  setSceneNodePosition,
} from '@flighthq/sdk';

// drawGlScene exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel —
// import the Gl scene functions directly. drawGlSceneShadowMap renders scene depth from the light into
// the shadow map (setting the per-state shadow on the runtime); drawGlScene's lit binds then PCF-sample
// it during shading.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerStandardPbrGlMaterial(state);

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
  // 1) Depth pass: render the scene from the light's POV into the shadow map (off the scene target).
  drawGlSceneShadowMap(state, scene, shadowCamera);

  // 2) Forward-lit pass into the effect pipeline's rgba16f + depth target; the lit shaders PCF-sample
  // the shadow map set above. Clear depth to the far plane so the LESS depth test occludes correctly.
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

// shadow-directional — proves the directional shadow recipe on the Gl backend: a sphere hovering over a
// ground plane, lit by one straight-down white sun, casts a dark shadow onto the plane beneath it. The
// recipe is two passes (render.webgl.ts): drawGlSceneShadowMap renders scene depth from the light into a
// shadow map, then drawGlScene's lit shaders PCF-sample it so the plane under the sphere is darkened.
//
// The oracle samples the ground in the foreground (lit) and the ground directly under the sphere
// (shadowed) and asserts the under-sphere ground is clearly darker — the signature of a real shadow (an
// unshadowed scene would light the whole plane uniformly). webgl-only: shadows are a Gl recipe today.
//
// createScene exists on both @flighthq/node and @flighthq/scene, so it collides in the @flighthq/sdk
// barrel — import the 3D scene one directly.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A light-gray diffuse material shared by the ground and the sphere; high roughness so the lit ground is
// a broad even bright that the shadow clearly darkens.
const material = createStandardPbrMaterial({ baseColor: 0xb8b8b8ff, metallic: 0, roughness: 0.8 });

const scene = createScene();

// Horizontal ground plane (createPlaneMeshGeometry is XZ, normal +Y).
const ground = createMesh(createPlaneMeshGeometry(8, 8), [material]);
addNodeChild(scene, ground);

// A sphere hovering above the plane centre — the shadow caster.
const sphere = createMesh(createSphereMeshGeometry(0.7, 32, 24), [material]);
setSceneNodePosition(sphere, 0, 1.3, 0);
addNodeChild(scene, sphere);

const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 3, 5), createVector3(0, 0.4, 0), createVector3(0, 1, 0));

// One white sun straight down + a dim ambient fill so the shadowed ground reads clearly dark.
const direction = createVector3(0, -1, 0);
const lights = {
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 3 }),
};

// Shadow camera fitted to the scene's world bounds along the light direction.
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
  // The ground recedes to a horizon near mid-screen; the sphere projects to the upper-centre and its
  // shadow lands as an ellipse on the ground just below it, centred around 56% of the frame height.
  // The lit ground in the near foreground is sampled at 90%. (Coordinates verified against the capture.)
  const litLuminance = getSurfacePixelLuminance(surface, cx, Math.floor(surface.height * 0.9)); // lit foreground ground
  const shadowLuminance = getSurfacePixelLuminance(surface, cx, Math.floor(surface.height * 0.56)); // ground under sphere

  if (litLuminance <= 24) {
    throw new Error(`[shadow-directional] ground is blank (luminance ${litLuminance}) — scene did not render`);
  }
  if (shadowLuminance + 32 >= litLuminance) {
    throw new Error(
      `[shadow-directional] no shadow: ground under the sphere (${shadowLuminance}) is not clearly darker than the lit ground (${litLuminance})`,
    );
  }
}
