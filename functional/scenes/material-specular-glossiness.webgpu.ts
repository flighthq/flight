import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createSpecularGlossinessPbrMaterial,
  createSphereMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuSpecularGlossinessPbrMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single sphere centred in it, about 245 px across — D = ' +
    'H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H — centred at (0.5*W, 0.5*H) = (400,300), lit from the right so the ' +
    'right side is clearly brighter than the left, with a moderately soft highlight on the lit side — neither a ' +
    'mirror-sharp point nor a completely matte wash. A sphere lit uniformly, or one brighter on the left, is the ' +
    'failure. The background stays near-black.',
);
// drawWgpuScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same forward-lit sphere as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (the PBR renderer writes linear HDR into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerWgpuSpecularGlossinessPbrMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
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

// material-specular-glossiness — proves a 3D SpecularGlossinessPbr mesh renders WITH directional
// lighting on the Gl and Wgpu forward renderers (scene-gl / scene-wgpu). A single mid-gray sphere
// sits at the origin under one white directional light (angled so its travel direction points
// down-left-into-screen) plus a dim ambient fill. The camera looks straight at the sphere from +z.
//
// Because the light travels toward -x / -y / -z, surfaces are lit from the OPPOSITE side
// (+x / +y / +z) — so the screen-RIGHT hemisphere of the sphere faces the light and is bright, while
// the screen-LEFT hemisphere falls into shadow (lit only by the dim ambient term). The assertion samples
// one pixel on each side and asserts the lit side is clearly brighter than the unlit side, which is
// the signature of real per-pixel directional shading (a flat/unlit fill would be uniform).
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts. It imports render from
// ./render (the local TS stub); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime.
// createScene3D exists on both @flighthq/node and @flighthq/scene3d, so it collides in the @flighthq/sdk
// barrel (conflicting star exports) and is unavailable there — import the 3D scene one directly. The
// Mesh added to it is a @flighthq/scene3d Node3D, so this is the type-correct source too.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so the shading gradient is clean, not faceted.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Legacy specular-glossiness dielectric: mid-gray diffuse with a dim specular tint and mid glossiness
// gives a broad diffuse falloff that reads clearly as a light/dark gradient across the sphere.
const material = createSpecularGlossinessPbrMaterial({
  diffuse: 0x808080ff,
  specular: 0x202020ff,
  glossiness: 0.5,
});

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the sphere from +z, looking at the origin. The aspect must match the
// target so the sphere stays circular (prepareScene3DRender reads aspect off the projection).
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
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
});

render(scene, camera, lights);

// Assertion: not blank + shows directional shading. The sphere is centered; sample a pixel on the lit
// (screen-right) hemisphere and one on the shadowed (screen-left) hemisphere, both inset from center
// so they land on the sphere surface, and assert the lit side is clearly brighter.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  // On-screen the sphere is ~120px in radius; sample ~60px either side of center so both points land
  // on its surface. The light faces +x, so the screen-right point is on the lit hemisphere and the
  // screen-left point is on the shadowed hemisphere.
  const offset = Math.floor(bitmap.width * 0.075);

  const litLuminance = getBitmapPixelLuminance(bitmap, cx + offset, cy);
  const shadowLuminance = getBitmapPixelLuminance(bitmap, cx - offset, cy);

  if (litLuminance <= 24) {
    throw new Error(
      `[material-specular-glossiness] lit side is blank (luminance ${litLuminance}) — mesh did not render`,
    );
  }
  if (litLuminance <= shadowLuminance + 24) {
    throw new Error(
      `[material-specular-glossiness] no directional shading: lit side (${litLuminance}) is not clearly brighter than shadow side (${shadowLuminance})`,
    );
  }
}
