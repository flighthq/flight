import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
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
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
  submitWgpuRenderPass,
  translateMatrix4,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with two overlapping unit cubes: a near red box (unlit 0xff3030, front face at depth 2.9 with scale s = H/(5.8*tan(PI/8)) ≈ 250: x W/2 − 0.15*s to W/2 + 0.85*s ≈ 363–612, y H/2 ± 0.5*s ≈ 175–425) and a far blue box (unlit 0x3060ff, front face at depth 4.1 with scale s = H/(8.2*tan(PI/8)) ≈ 177: x W/2 − 0.85*s to W/2 + 0.15*s ≈ 250–426, y H/2 ± 0.5*s ≈ 212–388). The near red box occludes the far blue box where their projections overlap near center. Red is visible at center and on the right; blue is visible only on the left flank where the near box does not cover it. Frame corners are background.',
);

// drawWgpuScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
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
registerWgpuUnlitMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
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

// mesh-multiple-depth — proves DEPTH-BUFFER OCCLUSION across two separate meshes on the Gl and Wgpu
// scene renderers. Two unlit boxes of distinct colors are placed so their screen projections OVERLAP
// in a known region, one NEAR the camera and one FAR behind it. Because the scene wiring enables a
// depth-stencil test, the NEAR box must win the overlap: every pixel in the overlap region is the near
// box's color, and the far box only shows where the near box does not cover it.
//
// This is a visual property jsdom cannot check: it requires real rasterization with a depth test. If
// depth testing is broken (disabled, wrong compare, or the boxes drawn in the wrong order with no
// depth buffer), the far box bleeds through the overlap and the overlap pixel reads as the FAR color —
// exactly the regression this test catches.
//
// Camera3D model (RH view, eye on +z looking at origin): +x is screen-right, +y is screen-up, and a
// LARGER +z translation moves a mesh TOWARD the eye (nearer). So the near box is translated to +z and
// the far box to -z; their x offsets are chosen to overlap in the middle while each keeps an exclusive
// flank.
//
// app.ts is backend-agnostic; the per-backend scene wiring (effect pipeline, depth-stencil, unlit
// material registration) lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Two unit boxes, distinct flat colors, unlit so the test reads occlusion and not shading.
const nearGeometry = createBoxMeshGeometry(1, 1, 1);
const farGeometry = createBoxMeshGeometry(1, 1, 1);
const nearMaterial = createUnlitMaterial({ baseColor: 0xff3030ff }); // near box: red
const farMaterial = createUnlitMaterial({ baseColor: 0x3060ffff }); // far box: blue

const scene = createScene3D().root;

// FAR box: shifted LEFT and pushed to -z (away from the eye). Its right flank reaches into the center.
const farMesh = createMesh(farGeometry, [farMaterial]);
const farLocal = createMatrix4();
translateMatrix4(farLocal, farLocal, -0.35, 0, -0.6);
setNodeLocalMatrix4(farMesh, farLocal);
addNodeChild(scene, farMesh);

// NEAR box: shifted RIGHT and pulled to +z (toward the eye). Its left flank overlaps the far box's
// right flank around screen center; the depth test must let the near box win that overlap.
const nearMesh = createMesh(nearGeometry, [nearMaterial]);
const nearLocal = createMatrix4();
translateMatrix4(nearLocal, nearLocal, 0.35, 0, 0.6);
setNodeLocalMatrix4(nearMesh, nearLocal);
addNodeChild(scene, nearMesh);

// Straight-on view from +z so depth maps cleanly to the z translations above. Eye ~ (0,0,4).
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Unlit ignores lights, but render() requires a valid rig.
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
  // Flank offset lands inside each box's EXCLUSIVE region (the boxes are ~1 unit ≈ 0.18*width wide and
  // overlap at center, so each exclusive flank centre is ~0.09*width off-centre).
  const off = Math.floor(bitmap.width * 0.09);

  // 1) The OVERLAP region (screen center) is the NEAR box's red — the near box occludes the far box.
  //    If depth occlusion is broken the far blue bleeds through here.
  const center = getBitmapPixelRgb(bitmap, cx, cy);
  if (!isRed(center)) {
    throw new Error(
      `[mesh-multiple-depth] overlap center not the near box red — got #${hex(center)} ` +
        `(far box showing through ⇒ depth occlusion broken)`,
    );
  }

  // 2) The near box's exclusive flank (to the RIGHT of center) is red — the near box really is there.
  const right = getBitmapPixelRgb(bitmap, cx + off, cy);
  if (!isRed(right)) {
    throw new Error(
      `[mesh-multiple-depth] near-box flank (right) not red — got #${hex(right)} (near box missing/misplaced)`,
    );
  }

  // 3) The far box's exclusive flank (to the LEFT of center, not covered by the near box) is blue —
  //    the far box is drawn, just occluded where the boxes overlap.
  const left = getBitmapPixelRgb(bitmap, cx - off, cy);
  if (!isBlue(left)) {
    throw new Error(
      `[mesh-multiple-depth] far-box flank (left) not blue — got #${hex(left)} (far box missing or fully hidden)`,
    );
  }

  // 4) The four frame corners are background — the boxes are bounded silhouettes, not a full clear.
  const m = Math.floor(bitmap.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [bitmap.width - m, m],
    [m, bitmap.height - m],
    [bitmap.width - m, bitmap.height - m],
  ]) {
    if (getBitmapPixelLuminance(bitmap, x, y) > 40) {
      throw new Error(`[mesh-multiple-depth] frame corner (${x},${y}) not background — silhouettes are not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  // 0xff3030: red dominant over both green and blue.
  return channel(rgb, 16) > 150 && channel(rgb, 16) > channel(rgb, 8) + 60 && channel(rgb, 16) > channel(rgb, 0) + 60;
}
function isBlue(rgb: number): boolean {
  // 0x3060ff: blue dominant over both red and green.
  return channel(rgb, 0) > 150 && channel(rgb, 0) > channel(rgb, 16) + 60 && channel(rgb, 0) > channel(rgb, 8) + 40;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
