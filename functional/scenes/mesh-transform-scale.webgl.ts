import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  getSurfacePixelRgb,
  normalizeVector3,
  prepareSceneRender,
  registerUnlitGlMaterial,
  renderGlBackground,
  scaleMatrix4,
  setCameraViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel
// (re-exported from both) and is unavailable there — import the Gl one directly from its package.

// Gl 3D column (wiring copied from material-unlit). The Unlit renderer writes into the effect pipeline's
// rgba16f + depth scene target (depth-test ON so the cube occludes itself correctly), then ends with an
// empty effect list to tone-present the scene straight to the canvas.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerUnlitGlMaterial(state);

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

// mesh-transform-scale — proves a Mesh's `localMatrix` SCALE enlarges the rendered geometry, by scaling an
// unlit unit box 2× and checking its silhouette grows past the unit footprint while staying bounded. The
// visual is a bigger block: a point that would be OUTSIDE the unit cube's projection is INSIDE the 2× cube,
// yet the frame corners stay background — a footprint that is larger but not full-frame.
//
// Camera is head-on (eye at (0,0,4), fovY = PI/4): the half-view-height at the z=0 plane is 4*tan(PI/8) ≈
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

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// THE FEATURE UNDER TEST: enlarge the mesh 2× via its localMatrix. scaleMatrix4 is out-param style —
// scaleMatrix4(out, source, sx, sy, sz) — applied in place to the mesh's identity localMatrix.
scaleMatrix4(mesh.localMatrix, mesh.localMatrix, 2, 2, 2);

// Head-on camera at (0,0,4): screen-space size scales directly with world size, easy to reason about.
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

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
