import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createNormalMaterial,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  getSurfacePixelRgb,
  normalizeVector3,
  prepareSceneRender,
  registerNormalGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel
// (re-exported from both) and is unavailable there — import the Gl one directly from its package.

// Gl forward-lit 3D column. The Normal renderer writes linear HDR into the effect pipeline's
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
registerNormalGlMaterial(state);

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

// material-normal — proves a NormalMaterial mesh renders its WORLD-SPACE surface normal as color on the
// Gl and Wgpu forward renderers, independent of scene lighting. A single sphere sits at the origin;
// NormalMaterial ignores lighting and encodes the world normal directly as RGB (n * 0.5 + 0.5), so each
// point on the sphere — whose normal points radially outward — maps to a distinct color. The
// front-center normal points straight at the camera (+z), while off-center normals tilt toward +x / +y,
// so the encoded color (and its luminance) changes across the surface.
//
// The signature this oracle checks: the center pixel and an on-sphere offset pixel encode different
// normals, so they differ in color/luminance. A flat/uniform fill — the failure mode if the normal were
// not being written — would show no such difference. Normals are WORLD-space, so the encoding is fixed
// by sphere orientation, not by the camera.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so the normal-encoded color varies cleanly across
// the surface rather than in coarse facets.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Encodes the world-space surface normal as color (n * 0.5 + 0.5). Lighting-independent.
const material = createNormalMaterial();

const scene = createScene().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the sphere from +z, looking at the origin. Aspect matches the target so
// the sphere stays circular.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// The same directional + ambient rig as material-standard-pbr. NormalMaterial ignores both — they are
// passed through unused so the scaffold matches the lit materials.
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

// Oracle: not blank + orientation-varying color. Sample the center (normal facing the camera) and an
// on-sphere offset point (a tilted normal); assert the center is not blank and that the two differ in
// RGB — proof that color tracks the world normal rather than being a flat fill. Luminance alone is too
// weak here because hue shifts in encoded normals can preserve nearly the same perceived brightness.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  // A small inset keeps the offset point on the sphere surface, where the normal tilts away from +z.
  const offsetX = Math.floor(surface.width * 0.07);

  const center = getSurfacePixelLuminance(surface, cx, cy);
  const centerRgb = getSurfacePixelRgb(surface, cx, cy);
  const offsetRgb = getSurfacePixelRgb(surface, cx + offsetX, cy);
  const delta = maxRgbDelta(centerRgb, offsetRgb);

  if (center <= 16) {
    throw new Error(`[material-normal] surface is blank (center luminance ${center}) — mesh did not render`);
  }
  if (delta <= 24) {
    throw new Error(
      `[material-normal] no normal variation: center (${formatRgb(centerRgb)}) and offset (${formatRgb(offsetRgb)}) are nearly equal — color appears to be a flat fill, not the world normal`,
    );
  }
}

function maxRgbDelta(a: number, b: number): number {
  return Math.max(
    Math.abs(((a >>> 16) & 0xff) - ((b >>> 16) & 0xff)),
    Math.abs(((a >>> 8) & 0xff) - ((b >>> 8) & 0xff)),
    Math.abs((a & 0xff) - (b & 0xff)),
  );
}

function formatRgb(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
