import { createScene } from '@flighthq/scene';
import { drawGlScene } from '@flighthq/scene-gl';
import type { Camera3D, GlRenderEffectPipeline, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
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
  rotateMatrix4,
  setCamera3DViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
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

// mesh-transform-rotation — proves a Mesh's `localMatrix` ROTATION reorients the rendered geometry, using
// an ELONGATED box (a bar along the X axis) so orientation is visually unmistakable. Unrotated, the bar is
// WIDE (horizontal); rotated 90° about Z it becomes TALL (vertical). The oracle asserts the silhouette now
// extends vertically and no longer horizontally — a result only a correctly-applied Z rotation can produce.
//
// Camera3D is head-on (eye at (0,0,4), looking at the origin), so the X bar lies flat in the screen plane and
// a Z rotation is an in-plane screen rotation. rotateMatrix4 takes RADIANS (rotateMatrix4(out, source, axis,
// radians)); the axis is world +Z = (0,0,1). A quarter turn (π/2) maps the bar's long X extent onto the
// screen's Y axis.
//
// app.ts is backend-agnostic; per-backend scene wiring lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A bar elongated along X (half-extents x±0.8, y±0.175): wide when unrotated, tall when rotated 90° about Z.
const geometry = createBoxMeshGeometry(1.6, 0.35, 0.35);
const material = createUnlitMaterial({ baseColor: 0xc06030ff });

const scene = createScene().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// THE FEATURE UNDER TEST: rotate the bar 90° about world +Z via its local matrix. rotateMatrix4 is out-param
// style and takes RADIANS — rotateMatrix4(out, source, axis, radians) — applied to a fresh identity matrix,
// then set on the mesh via setNodeLocalMatrix4 (the author-the-matrix-directly escape hatch).
const zAxis = createVector3(0, 0, 1);
const meshLocal = createMatrix4();
rotateMatrix4(meshLocal, meshLocal, zAxis, Math.PI / 2);
setNodeLocalMatrix4(mesh, meshLocal);

// Head-on camera at (0,0,4): the X bar lies in the screen plane; a Z rotation rotates it within the screen.
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
  // 0.10*width ≈ world 0.44: comfortably INSIDE the rotated bar's long (0.8) half-extent vertically (so
  // the vertical samples avoid the antialiased top/bottom edge) and well OUTSIDE its short (0.175)
  // half-extent horizontally. A larger offset (e.g. 0.18 ≈ world 0.795) lands on the bar's very edge.
  const off = Math.floor(surface.width * 0.1);

  // The bar is still centered, so the frame center is on it regardless of orientation.
  const center = getSurfacePixelRgb(surface, cx, cy);
  if (!isRust(center)) {
    throw new Error(
      `[mesh-transform-rotation] frame center is not the bar color — got #${hex(center)} (bar missing or mis-projected)`,
    );
  }

  // 1) The silhouette now extends VERTICALLY: points directly above and below center are on the bar. After a
  //    90° Z rotation the long extent runs along screen Y; world ±0.795 sits inside the rotated half-extent 0.8.
  for (const dy of [off, -off]) {
    if (!isRust(getSurfacePixelRgb(surface, cx, cy + dy))) {
      throw new Error(
        `[mesh-transform-rotation] sample at (0,${dy}) is not the bar — the bar is not vertical (Z rotation not applied)`,
      );
    }
  }

  // 2) The silhouette no longer extends HORIZONTALLY: points left and right of center are background. The bar's
  //    short (0.175) extent is along screen X after rotation, so world ±0.795 falls outside it.
  for (const dx of [off, -off]) {
    if (getSurfacePixelLuminance(surface, cx + dx, cy) > 40) {
      throw new Error(
        `[mesh-transform-rotation] sample at (${dx},0) is not background — the bar is still horizontal (Z rotation not applied)`,
      );
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRust(rgb: number): boolean {
  // 0xc06030: strong red, mid green, low blue, red dominant — clearly not the dark background.
  return channel(rgb, 16) > 90 && channel(rgb, 16) > channel(rgb, 0) + 40 && channel(rgb, 16) > channel(rgb, 8);
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
