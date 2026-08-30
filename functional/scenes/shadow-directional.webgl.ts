import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D, drawGlScene3DShadowMap } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
  createGlContextState,
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  configureDirectionalShadowCamera3D,
  createAabb,
  createAmbientLight,
  createCamera3D,
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
  getNode3DWorldBounds,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerGlStandardPbrMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 near-black sky frames a light-grey ground plane receding toward mid-field and a ' +
    'light-grey sphere hovering at the upper centre. A dark elliptical shadow lies on the plane ' +
    'directly beneath the sphere around 56% of the field height, while the near foreground around 90% ' +
    'height remains broadly and clearly lit. The ground is not uniformly bright, the under-sphere ' +
    'patch is more than 32 luminance levels darker than the foreground, and neither the sphere nor ' +
    'its shadow is missing or detached sideways.',
);

// drawGlScene3D exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel —
// import the Gl scene functions directly. drawGlScene3DShadowMap renders scene depth from the light into
// the shadow map (setting the per-state shadow on the runtime); drawGlScene3D's lit binds then PCF-sample
// it during shading.

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2dGlPipeline,
  {
    pixelRatio,
    backgroundColor: 0x0a0c10ff,
  },
);
registerGlStandardPbrMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  shadowCamera: Readonly<Camera3D>,
): void {
  prepareScene3DRender(state, scene, camera, lights);
  // 1) Depth pass: render the scene from the light's POV into the shadow map (off the scene target).
  drawGlScene3DShadowMap(state, scene, shadowCamera, lights.directional);

  // 2) Forward-lit pass into the effect pipeline's rgba16f + depth target; the lit shaders PCF-sample
  // the shadow map set above. Clear depth to the far plane so the LESS depth test occludes correctly.
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// shadow-directional — proves the directional shadow recipe on the Gl backend: a sphere hovering over a
// ground plane, lit by one straight-down white sun, casts a dark shadow onto the plane beneath it. The
// recipe is two passes (render.webgl.ts): drawGlScene3DShadowMap renders scene depth from the light into a
// shadow map, then drawGlScene3D's lit shaders PCF-sample it so the plane under the sphere is darkened.
//
// The scene assertion samples the ground in the foreground (lit) and the ground directly under the sphere
// (shadowed) and asserts the under-sphere ground is clearly darker — the signature of a real shadow (an
// unshadowed scene would light the whole plane uniformly). The WebGPU twin exercises the same recipe.
//
// createScene3D exists on both @flighthq/node and @flighthq/scene3d, so it collides in the @flighthq/sdk
// barrel — import the 3D scene one directly.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A light-gray diffuse material shared by the ground and the sphere; high roughness so the lit ground is
// a broad even bright that the shadow clearly darkens.
const material = createStandardPbrMaterial({ baseColor: 0xb8b8b8ff, metallic: 0, roughness: 0.8 });

const scene = createScene3D().root;

// Horizontal ground plane (createPlaneMeshGeometry is XZ, normal +Y).
const ground = createMesh(createPlaneMeshGeometry(8, 8), [material]);
addNodeChild(scene, ground);

// A sphere hovering above the plane centre — the shadow caster.
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

// One white sun straight down + a dim ambient fill so the shadowed ground reads clearly dark.
const direction = createVector3(0, -1, 0);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  // Keep all three sampling controls explicit here. This is the zero-bias, single-tap witness: its
  // capture must remain free of obvious acne without silently inheriting the old 0.0025/3x3 behavior.
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

// Shadow camera fitted to the scene's world bounds along the light direction.
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
  // The ground recedes to a horizon near mid-screen; the sphere projects to the upper-centre and its
  // shadow lands as an ellipse on the ground just below it, centred around 56% of the frame height.
  // The lit ground in the near foreground is sampled at 90%. (Coordinates verified against the capture.)
  const litLuminance = getBitmapPixelLuminance(bitmap, cx, Math.floor(bitmap.height * 0.9)); // lit foreground ground
  const shadowLuminance = getBitmapPixelLuminance(bitmap, cx, Math.floor(bitmap.height * 0.56)); // ground under sphere

  if (litLuminance <= 24) {
    throw new Error(`[shadow-directional] ground is blank (luminance ${litLuminance}) — scene did not render`);
  }
  if (shadowLuminance + 32 >= litLuminance) {
    throw new Error(
      `[shadow-directional] no shadow: ground under the sphere (${shadowLuminance}) is not clearly darker than the lit ground (${litLuminance})`,
    );
  }
}
