import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createEmissiveMaterial,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  registerEmissiveWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// drawWgpuScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same forward-lit sphere as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (StandardPbr writes linear HDR into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerEmissiveWgpuMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera3D>, lights: Readonly<SceneLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// material-emissive — proves an EmissiveMaterial mesh renders as a SELF-ILLUMINATED surface on the Gl
// and Wgpu forward renderers, independent of scene lighting. A single emissive-green sphere sits at the
// origin under the SAME directional + ambient rig as material-standard-pbr — but because Emissive is
// lighting-independent, the surface must read as a flat, bright, roughly UNIFORM green with no
// light/dark gradient across it. That uniformity (despite a strong angled directional light) is the
// signature that separates a self-lit material from a shaded one: a PBR sphere under this rig has a
// clear bright/shadow split (see material-standard-pbr), while Emissive does not.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so a (hypothetical) shading gradient would read
// cleanly — the point is that Emissive shows none.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Emissive green at strength 2 (> 1 also drives bloom on the GPU effect stack, but here we just read
// raw brightness). emissiveStrength scales the linear radiance written into the rgba16f scene target.
const material = createEmissiveMaterial({
  emissive: 0x30c040ff,
  emissiveStrength: 2,
});

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

// The same strong angled sun + ambient fill as material-standard-pbr. Emissive ignores both, so this
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

// Oracle: the surface is bright (self-lit) AND uniform (lighting-independent). Sample the center plus
// the two points material-standard-pbr uses for its lit/shadow split. For Emissive all three must be
// bright, and the "lit" and "shadow" samples must be close — a shaded material would differ sharply.
export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const offset = Math.floor(surface.width * 0.075);

  const center = getSurfacePixelLuminance(surface, cx, cy);
  const right = getSurfacePixelLuminance(surface, cx + offset, cy);
  const left = getSurfacePixelLuminance(surface, cx - offset, cy);

  if (center <= 24) {
    throw new Error(`[material-emissive] surface is blank (center luminance ${center}) — mesh did not render`);
  }
  // Lighting-independent: the two flanking samples must be within a small margin of each other (no
  // directional gradient). A shaded sphere under this rig splits these by 50+ luminance.
  if (Math.abs(right - left) > 24) {
    throw new Error(
      `[material-emissive] emissive surface is not uniform: left (${left}) vs right (${right}) differ — it appears to be responding to the directional light`,
    );
  }
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
