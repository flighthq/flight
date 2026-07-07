import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMatcapMaterial,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  registerMatcapGlMaterial,
  renderGlBackground,
  setCameraViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel
// (re-exported from both) and is unavailable there — import the Gl one directly from its package.

// Gl forward-lit 3D column. The StandardPbr renderer writes linear HDR into the effect pipeline's
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
registerMatcapGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera>, lights: Readonly<SceneLights>): void {
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

// material-matcap — proves a MatcapMaterial mesh renders as a FLAT, UNSHADED surface on the Gl and Wgpu
// forward renderers, independent of scene lighting. A single matcap sphere sits at the origin under the
// SAME directional + ambient rig as material-standard-pbr — but Matcap is lighting-independent, so the
// surface must read as a flat, bright, roughly UNIFORM color with no light/dark gradient across it. That
// uniformity (despite a strong angled directional light) is the signature that separates an unshaded
// material from a shaded one: a PBR sphere under this rig has a clear bright/shadow split (see
// material-standard-pbr), while Matcap does not.
//
// NOTE: this test is TEXTURE-FREE — no matcap texture is supplied (a textured scene breaks the cross-
// backend Wgpu parity gate, which does not sample textures). With no matcap texture, Matcap renders the
// tint alone on both backends, so its functional signature is the same uniform/not-blank archetype as
// material-unlit. Full matcap sampling (sphere-mapped lighting from a matcap texture + view matrix) is
// deferred — the same gap is noted in the Gl/Wgpu matcap renderers.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so a (hypothetical) shading gradient would read
// cleanly — the point is that Matcap shows none.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// A flat blue tint. With no matcap texture supplied, Matcap emits this tint directly to the rgba16f
// scene target, ignoring all lights and surface normals.
const material = createMatcapMaterial({ tint: 0x40a0e0ff });

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the sphere from +z, looking at the origin. Aspect matches the target so
// the sphere stays circular.
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// The same strong angled sun + ambient fill as material-standard-pbr. Matcap ignores both, so this
// rig is here precisely to prove the surface does NOT respond to it.
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

// Oracle: the surface is bright (the tint emits directly) AND uniform (lighting-independent). Sample the
// center plus the two points material-standard-pbr uses for its lit/shadow split. For Matcap all three
// must be bright, and the "lit" and "shadow" samples must be close — a shaded material differs sharply.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.075);

  const center = getSurfacePixelLuminance(surface, cx, cy);
  const right = getSurfacePixelLuminance(surface, cx + offset, cy);
  const left = getSurfacePixelLuminance(surface, cx - offset, cy);

  if (center <= 24) {
    throw new Error(`[material-matcap] surface is blank (center luminance ${center}) — mesh did not render`);
  }
  // Lighting-independent: the two flanking samples must be within a small margin of each other (no
  // directional gradient). A shaded sphere under this rig splits these by 50+ luminance.
  if (Math.abs(right - left) > 24) {
    throw new Error(
      `[material-matcap] matcap surface is not uniform: left (${left}) vs right (${right}) differ — it appears to be responding to the directional light`,
    );
  }
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
