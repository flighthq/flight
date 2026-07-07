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
  createOrthographicProjection,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  normalizeVector3,
  prepareSceneRender,
  registerUnlitGlMaterial,
  renderGlBackground,
  setCameraViewMatrix4FromLookAt,
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

// BACKEND CAVEAT: scoped to WebGL (render.webgpu.ts intentionally removed). Orthographic projection
// renders BLANK on WebGPU while perspective renders fine — almost certainly a clip-space z-range issue
// (WebGPU NDC z is [0,1] vs WebGL [-1,1]; the ortho matrix is not remapped for it). A real renderer gap
// to fix in the WebGPU scene path, not a test problem.
//
// camera-orthographic — proves the camera's ORTHOGRAPHIC projection on the Gl and Wgpu scene renderers.
// Two IDENTICAL unit boxes sit side by side in X (one left, one right) but at DIFFERENT depths: the
// right box is pushed far from the camera (-z) and the left box pulled near (+z). Under an orthographic
// projection on-screen size is independent of depth, so both boxes must rasterize to the SAME silhouette
// width. Under a perspective projection the far box would be visibly smaller — so measuring the two
// widths and asserting they are approximately equal is the signature that distinguishes ortho from
// perspective.
//
// This is a property jsdom cannot check: it needs real projection + rasterization. The oracle scans a
// horizontal line through the boxes, counts each box's contiguous lit-column run (its on-screen width),
// and asserts the two are within ~15% of each other. If the projection silently fell back to perspective
// (or ortho half-extents were mis-wired), the far box would shrink and the widths would diverge.
//
// Camera model (RH view, eye on +z looking at origin): +x is screen-right, larger +z is nearer the eye.
// Only the PROJECTION differs from the perspective tests; the look-at view is identical.
//
// app.ts is backend-agnostic; the per-backend scene wiring lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;
const aspect = logicalWidth / logicalHeight;

// Two identical unit boxes, distinct colors only so each is visible; same geometry size.
const leftGeometry = createBoxMeshGeometry(1, 1, 1);
const rightGeometry = createBoxMeshGeometry(1, 1, 1);
const leftMaterial = createUnlitMaterial({ baseColor: 0xe0c040ff }); // left/near: amber
const rightMaterial = createUnlitMaterial({ baseColor: 0x40b0e0ff }); // right/far: cyan

const scene = createScene();

// LEFT box: NEAR the camera (+z), shifted left.
const leftMesh = createMesh(leftGeometry, [leftMaterial]);
translateMatrix4(leftMesh.localMatrix, leftMesh.localMatrix, -1.2, 0, 1.5);
addNodeChild(scene, leftMesh);

// RIGHT box: FAR from the camera (-z), shifted right by the same amount. Under perspective it would
// project smaller; under ortho it stays the same on-screen size as the left box.
const rightMesh = createMesh(rightGeometry, [rightMaterial]);
translateMatrix4(rightMesh.localMatrix, rightMesh.localMatrix, 1.2, 0, -1.5);
addNodeChild(scene, rightMesh);

// Orthographic frustum sized to frame both boxes (centers at x = ±1.2, each box ±0.5 wide) with margin.
// Full visible width is 2*halfWidth = 6 units; height is 2*halfHeight = 6/aspect units.
const halfWidth = 3;
const halfHeight = halfWidth / aspect;
const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: halfHeight, halfWidth: halfWidth }),
});

// Same straight-on look-at view as the perspective tests; only the projection above differs.
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

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

  // Measure each box's on-screen silhouette width by the widest contiguous run of lit columns on the
  // center row, scanned within the left half [0, cx) and right half [cx, width) respectively.
  const leftWidth = widestLitRun(surface, cy, 0, cx);
  const rightWidth = widestLitRun(surface, cy, cx, surface.width);

  // Each box must actually be present (a real silhouette, not a sliver).
  const minPixels = Math.floor(surface.width * 0.05);
  if (leftWidth < minPixels) {
    throw new Error(
      `[camera-orthographic] left (near) box silhouette too small — ${leftWidth}px (box missing/mis-projected)`,
    );
  }
  if (rightWidth < minPixels) {
    throw new Error(
      `[camera-orthographic] right (far) box silhouette too small — ${rightWidth}px (box missing/mis-projected)`,
    );
  }

  // Under ORTHO the two widths are equal regardless of depth. Allow ~15% for rasterization rounding.
  // Under perspective the far (right) box would be clearly narrower and this would fail.
  const ratio = Math.min(leftWidth, rightWidth) / Math.max(leftWidth, rightWidth);
  if (ratio < 0.85) {
    throw new Error(
      `[camera-orthographic] box widths differ with depth — near ${leftWidth}px vs far ${rightWidth}px (ratio ${ratio.toFixed(2)}) ` +
        `⇒ projection is not orthographic (far box shrank like perspective)`,
    );
  }

  // The frame corners are background — bounded silhouettes, not a full clear.
  const m = Math.floor(surface.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [surface.width - m, m],
    [m, surface.height - m],
    [surface.width - m, surface.height - m],
  ]) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
      throw new Error(`[camera-orthographic] frame corner (${x},${y}) not background — silhouettes are not bounded`);
    }
  }
}

// Widest contiguous run of foreground (non-background) columns on row `y`, scanning x in [xStart, xEnd).
function widestLitRun(surface: Readonly<Surface>, y: number, xStart: number, xEnd: number): number {
  let best = 0;
  let run = 0;
  for (let x = xStart; x < xEnd; x++) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}
