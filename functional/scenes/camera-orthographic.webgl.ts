import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerGlUnlitMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  invalidateNodeLocalTransform,
  setVector3,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with two solid cubes side by side, level with each other across ' +
    'the middle of the field: an amber one centred near x 240 and a cyan one centred near x 560. THE TWO ARE THE ' +
    'SAME SIZE ON SCREEN — each 133.3 px square, since the orthographic view spans 2*halfWidth = 6 world units ' +
    'across W and 2*halfHeight = 4.5 across H, so one world unit is W/6 = H/4.5 = 133.3 px either way, and the ' +
    'cubes are centred at (0.5*W - 1.2*(W/6), 0.5*H) = (240,300) and (0.5*W + 1.2*(W/6), 0.5*H) = (560,300) — and ' +
    'that equality is the entire claim, because they sit at different distances from the camera: the amber one is ' +
    'nearer, the cyan one further away. A picture where the cyan cube is visibly smaller than the amber one is ' +
    'the failure this exists to catch. Both are flat, unshaded colour with no face-to-face brightness variation. ' +
    'They do not overlap or touch, and the space around and between them is the near-black background.',
);
// drawGlScene3D exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel
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
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerGlUnlitMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  // renderGlBackground clears color; the depth attachment needs its own clear to the far plane (1.0)
  // or every fragment fails the LESS depth test against an uncleared (0) buffer and the scene is black.
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// camera-orthographic — proves the camera's ORTHOGRAPHIC projection on the Gl and Wgpu scene renderers.
// Two IDENTICAL unit boxes sit side by side in X (one left, one right) but at DIFFERENT depths: the
// right box is pushed far from the camera (-z) and the left box pulled near (+z). Under an orthographic
// projection on-screen size is independent of depth, so both boxes must rasterize to the SAME silhouette
// width. Under a perspective projection the far box would be visibly smaller — so measuring the two
// widths and asserting they are approximately equal is the signature that distinguishes ortho from
// perspective.
//
// This is a property jsdom cannot check: it needs real projection + rasterization. The assertion scans a
// horizontal line through the boxes, counts each box's contiguous lit-column run (its on-screen width),
// and asserts the two are within ~15% of each other. If the projection silently fell back to perspective
// (or ortho half-extents were mis-wired), the far box would shrink and the widths would diverge.
//
// Camera3D model (RH view, eye on +z looking at origin): +x is screen-right, larger +z is nearer the eye.
// Only the PROJECTION differs from the perspective tests; the look-at view is identical.

const logicalWidth = width / scale;
const logicalHeight = height / scale;
const aspect = logicalWidth / logicalHeight;

// Two identical unit boxes, distinct colors only so each is visible; same geometry size.
const leftGeometry = createBoxMeshGeometry(1, 1, 1);
const rightGeometry = createBoxMeshGeometry(1, 1, 1);
const leftMaterial = createUnlitMaterial({ baseColor: 0xe0c040ff }); // left/near: amber
const rightMaterial = createUnlitMaterial({ baseColor: 0x40b0e0ff }); // right/far: cyan

const scene = createScene3D().root;

// LEFT box: NEAR the camera (+z), shifted left.
const leftMesh = createMesh(leftGeometry, [leftMaterial]);
setVector3(leftMesh.position, -1.2, 0, 1.5);
invalidateNodeLocalTransform(leftMesh);
addNodeChild(scene, leftMesh);

// RIGHT box: FAR from the camera (-z), shifted right by the same amount. Under perspective it would
// project smaller; under ortho it stays the same on-screen size as the left box.
const rightMesh = createMesh(rightGeometry, [rightMaterial]);
setVector3(rightMesh.position, 1.2, 0, -1.5);
invalidateNodeLocalTransform(rightMesh);
addNodeChild(scene, rightMesh);

// Orthographic frustum sized to frame both boxes (centers at x = ±1.2, each box ±0.5 wide) with margin.
// Full visible width is 2*halfWidth = 6 units; height is 2*halfHeight = 6/aspect units.
const halfWidth = 3;
const halfHeight = halfWidth / aspect;
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: halfHeight, halfWidth: halfWidth }),
});

// Same straight-on look-at view as the perspective tests; only the projection above differs.
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const backgroundLuminance = getBitmapPixelLuminance(bitmap, 0, 0);

  // Measure each box's on-screen silhouette width by the widest contiguous run of lit columns on the
  // center row, scanned within the left half [0, cx) and right half [cx, width) respectively.
  const leftWidth = widestLitRun(bitmap, cy, 0, cx, backgroundLuminance);
  const rightWidth = widestLitRun(bitmap, cy, cx, bitmap.width, backgroundLuminance);

  // Each box must actually be present (a real silhouette, not a sliver).
  const minPixels = Math.floor(bitmap.width * 0.05);
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
  const m = Math.floor(bitmap.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [bitmap.width - m, m],
    [m, bitmap.height - m],
    [bitmap.width - m, bitmap.height - m],
  ]) {
    if (Math.abs(getBitmapPixelLuminance(bitmap, x, y) - backgroundLuminance) > 10) {
      throw new Error(`[camera-orthographic] frame corner (${x},${y}) not background — silhouettes are not bounded`);
    }
  }
}

// Widest contiguous run of foreground (non-background) columns on row `y`, scanning x in [xStart, xEnd).
function widestLitRun(
  bitmap: Readonly<Bitmap>,
  y: number,
  xStart: number,
  xEnd: number,
  backgroundLuminance: number,
): number {
  let best = 0;
  let run = 0;
  for (let x = xStart; x < xEnd; x++) {
    if (Math.abs(getBitmapPixelLuminance(bitmap, x, y) - backgroundLuminance) > 10) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}
