import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createClearcoatPbrMaterial,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterialProperties,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  registerClearcoatPbrGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel
// (re-exported from both) and is unavailable there — import the Gl one directly from its package.

// Gl forward-lit 3D column. The PBR renderer writes linear HDR into the effect pipeline's
// rgba16f + depth scene target (depth-test ON so the sphere occludes itself correctly), then end with
// an empty effect list to tone-present the HDR scene straight to the canvas.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerClearcoatPbrGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera3D>, lights: Readonly<SceneLights>): void {
  beginGlRenderEffectPipeline(state, pipeline);
  // renderGlBackground clears color; the depth attachment needs its own clear to the far plane (1.0)
  // or every fragment fails the LESS depth test against an uncleared (0) buffer and the scene is black.
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareSceneRender(state, scene, camera, lights);
  drawGlScene(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// material-clearcoat — proves a 3D ClearcoatPbrMaterial mesh renders WITH directional lighting on the Gl and Wgpu
// forward renderers (scene-gl / scene-wgpu). A single mid-gray sphere sits at the origin under one
// white directional light (angled so its travel direction points down-left-into-screen) plus a dim
// ambient fill. The camera looks straight at the sphere from +z.
//
// Because the light travels toward -x / -y / -z, surfaces are lit from the OPPOSITE side
// (+x / +y / +z) — so the screen-RIGHT hemisphere of the sphere faces the light and is bright, while
// the screen-LEFT hemisphere falls into shadow (lit only by the dim ambient term). The oracle samples
// one pixel on each side and asserts the lit side is clearly brighter than the unlit side, which is
// the signature of real per-pixel directional shading (a flat/unlit fill would be uniform).
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts. It imports render from
// ./render (the local TS stub); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime.
// createScene exists on both @flighthq/node and @flighthq/scene, so it collides in the @flighthq/sdk
// barrel (conflicting star exports) and is unavailable there — import the 3D scene one directly. The
// Mesh added to it is a @flighthq/scene SceneNode, so this is the type-correct source too.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so the shading gradient is clean, not faceted.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Mid-gray dielectric base (metallic 0, roughness ~0.5) gives a broad diffuse falloff that reads
// clearly as a light/dark gradient across the sphere, with the extension factors set strongly active.
const material = createClearcoatPbrMaterial({
  standard: createStandardPbrMaterialProperties({ baseColor: 0x808080ff, metallic: 0, roughness: 0.5 }),
  clearcoat: 1,
  clearcoatRoughness: 0.2,
});

const scene = createScene().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the sphere from +z, looking at the origin. The aspect must match the
// target so the sphere stays circular (prepareSceneRender reads aspect off the projection).
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// One white sun + a dim cool ambient fill. The sun travels down-left-into-screen, so the +x / +y / +z
// (screen up-right, toward camera) hemisphere is lit and the opposite hemisphere is shadowed.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
};

render(scene, camera, lights);

// Oracle: not blank + shows directional shading. The sphere is centered; sample a pixel on the lit
// (screen-right) hemisphere and one on the shadowed (screen-left) hemisphere, both inset from center
// so they land on the sphere surface, and assert the lit side is clearly brighter.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  // On-screen the sphere is ~120px in radius; sample ~60px either side of center so both points land
  // on its surface. The light faces +x, so the screen-right point is on the lit hemisphere and the
  // screen-left point is on the shadowed hemisphere.
  const offset = Math.floor(surface.width * 0.075);

  const litLuminance = getSurfacePixelLuminance(surface, cx + offset, cy);
  const shadowLuminance = getSurfacePixelLuminance(surface, cx - offset, cy);

  if (litLuminance <= 24) {
    throw new Error(`[material-clearcoat] lit side is blank (luminance ${litLuminance}) — mesh did not render`);
  }
  if (litLuminance <= shadowLuminance + 24) {
    throw new Error(
      `[material-clearcoat] no directional shading: lit side (${litLuminance}) is not clearly brighter than shadow side (${shadowLuminance})`,
    );
  }
}
