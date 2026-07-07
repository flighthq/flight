import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera,
  createClearcoatPbrMaterial,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterialProperties,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  registerClearcoatPbrWgpuMaterial,
  renderWgpuBackground,
  setCameraViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// drawWgpuScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same forward-lit sphere as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (the PBR renderer writes linear HDR into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerClearcoatPbrWgpuMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera>, lights: Readonly<SceneLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

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

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the sphere from +z, looking at the origin. The aspect must match the
// target so the sphere stays circular (prepareSceneRender reads aspect off the projection).
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

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
