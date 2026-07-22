import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMatrix4,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  getSurfacePixelRgb,
  normalizeVector3,
  prepareSceneRender,
  registerUnlitWgpuMaterial,
  renderWgpuBackground,
  scaleMatrix4,
  setCamera3DViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// drawWgpuScene collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same unlit cube as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (the Unlit renderer writes into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerUnlitWgpuMaterial(state);

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

// mesh-transform-scale — proves a Mesh's `localMatrix` SCALE enlarges the rendered geometry, by scaling an
// unlit unit box 2× and checking its silhouette grows past the unit footprint while staying bounded. The
// visual is a bigger block: a point that would be OUTSIDE the unit cube's projection is INSIDE the 2× cube,
// yet the frame corners stay background — a footprint that is larger but not full-frame.
//
// Camera3D is head-on (eye at (0,0,4), fovY = PI/4): the half-view-height at the z=0 plane is 4*tan(PI/8) ≈
// 1.657 world units, mapping ~0.005523 world units per pixel. So the unit box (half-extent 0.5) reaches
// ~0.113*width from center; the 2× box (half-extent 1.0) reaches ~0.226*width. A sample at 0.16*width is
// between them: outside the unit footprint, inside the doubled one. scaleMatrix4(out, source, sx, sy, sz).
//
// app.ts is backend-agnostic; per-backend scene wiring lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A unit cube, flat violet and unlit so the test reads silhouette size, not lighting.
const geometry = createBoxMeshGeometry(1, 1, 1);
const material = createUnlitMaterial({ baseColor: 0x8040d0ff });

const scene = createScene().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// THE FEATURE UNDER TEST: enlarge the mesh 2× via its local matrix. scaleMatrix4 is out-param style —
// scaleMatrix4(out, source, sx, sy, sz) — applied to a fresh identity matrix, then set on the mesh via
// setNodeLocalMatrix4 (the author-the-matrix-directly escape hatch).
const meshLocal = createMatrix4();
scaleMatrix4(meshLocal, meshLocal, 2, 2, 2);
setNodeLocalMatrix4(mesh, meshLocal);

// Head-on camera at (0,0,4): screen-space size scales directly with world size, easy to reason about.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Unlit ignores lights, but render() requires a valid rig.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);

  // The box is centered, so center is on it regardless of scale.
  const center = getSurfacePixelRgb(surface, cx, cy);
  if (!isViolet(center)) {
    throw new Error(
      `[mesh-transform-scale] frame center is not the box color — got #${hex(center)} (box missing or mis-projected)`,
    );
  }

  // 1) A point at ~0.16*width from center is OUTSIDE a unit box's projection (~0.113*width) but INSIDE the
  //    2× box (~0.226*width). It being on the box proves the silhouette grew — only the scale can do this.
  const grown = Math.floor(surface.width * 0.16);
  for (const [dx, dy] of [
    [grown, 0],
    [-grown, 0],
    [0, grown],
    [0, -grown],
  ]) {
    if (!isViolet(getSurfacePixelRgb(surface, cx + dx, cy + dy))) {
      throw new Error(
        `[mesh-transform-scale] sample at (${dx},${dy}) is not the box — silhouette did not grow (scale not applied)`,
      );
    }
  }

  // 2) The frame corners (~0.45*width from center) are still background — the 2× box is larger but bounded,
  //    not a full-frame fill.
  const m = Math.floor(surface.width * 0.45);
  for (const [dx, dy] of [
    [m, m],
    [-m, m],
    [m, -m],
    [-m, -m],
  ]) {
    if (getSurfacePixelLuminance(surface, cx + dx, cy + dy) > 40) {
      throw new Error(
        `[mesh-transform-scale] frame corner (${dx},${dy}) is not background — the scaled box is not bounded`,
      );
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isViolet(rgb: number): boolean {
  // 0x8040d0: mid red, low green, strong blue — blue dominant, clearly not the dark background.
  return channel(rgb, 0) > 120 && channel(rgb, 0) > channel(rgb, 8) + 40 && channel(rgb, 0) > channel(rgb, 16);
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
