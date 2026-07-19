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
  createMatrix4,
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
  setCameraViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
  translateMatrix4,
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

// mesh-transform-position — proves a Mesh's `localMatrix` TRANSLATION moves the rendered geometry in
// world space, by shifting an unlit box off the origin and checking it lands in the upper-right of the
// frame instead of the center. The visual is unambiguous: a centered box vs. an off-center box is the
// most direct screen-space evidence that the model matrix is consumed by the scene update + projection.
//
// Camera is head-on (eye at (0,0,4), looking at the origin) so screen position is easy to reason about:
// world +x → screen right, world +y → screen up. The box is translated to (+1.3, +0.7, 0); its silhouette
// therefore moves up-and-right, the frame center becomes background, and the cube color appears off-center.
//
// app.ts is backend-agnostic; per-backend scene wiring lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A unit cube, flat teal and unlit so the test reads geometry placement, not lighting.
const geometry = createBoxMeshGeometry(1, 1, 1);
const material = createUnlitMaterial({ baseColor: 0x30c0a0ff });

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// THE FEATURE UNDER TEST: shift the mesh off-center via its local matrix. translateMatrix4 is out-param
// style — translateMatrix4(out, source, tx, ty, tz) — applied to a fresh identity matrix, then set on the
// mesh via setNodeLocalMatrix4 (the author-the-matrix-directly escape hatch).
const meshLocal = createMatrix4();
translateMatrix4(meshLocal, meshLocal, 1.3, 0.7, 0);
setNodeLocalMatrix4(mesh, meshLocal);

// Head-on camera at (0,0,4): world +x → screen right, world +y → screen up. fovY = PI/4.
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

  // 1) The frame CENTER is background: the box was translated away from the origin, so the origin (which
  //    projects to screen center) no longer carries the cube.
  if (getSurfacePixelLuminance(surface, cx, cy) > 40) {
    throw new Error(
      `[mesh-transform-position] frame center is not background — the box did not move off-center (localMatrix translation ignored)`,
    );
  }

  // 2) A point UP-AND-RIGHT of center is the cube color. The box center is at world (1.3, 0.7), which
  //    projects to the upper-right; sample solidly inside that projected silhouette.
  const sx = cx + Math.floor(surface.width * 0.2);
  const sy = cy - Math.floor(surface.width * 0.14);
  const hit = getSurfacePixelRgb(surface, sx, sy);
  if (!isTeal(hit)) {
    throw new Error(
      `[mesh-transform-position] upper-right sample is not the cube teal — got #${hex(hit)} (box not translated up-and-right)`,
    );
  }

  // 3) The lower-left of the frame stays background — the silhouette is bounded and only the upper-right
  //    moved, not a full-frame fill or a re-centered box.
  const lx = cx - Math.floor(surface.width * 0.2);
  const ly = cy + Math.floor(surface.width * 0.14);
  if (getSurfacePixelLuminance(surface, lx, ly) > 40) {
    throw new Error(
      `[mesh-transform-position] lower-left sample is not background — silhouette is not bounded to the upper-right`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isTeal(rgb: number): boolean {
  // 0x30c0a0: low red, strong green, mid-high blue — green dominant, clearly not the dark background.
  return channel(rgb, 8) > 130 && channel(rgb, 8) > channel(rgb, 16) + 50 && channel(rgb, 0) > 80;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
