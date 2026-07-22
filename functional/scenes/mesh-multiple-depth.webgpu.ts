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
  setCamera3DViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
  submitWgpuRenderPass,
  translateMatrix4,
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

const scene = createScene().root;

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
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  // Flank offset lands inside each box's EXCLUSIVE region (the boxes are ~1 unit ≈ 0.18*width wide and
  // overlap at center, so each exclusive flank centre is ~0.09*width off-centre).
  const off = Math.floor(surface.width * 0.09);

  // 1) The OVERLAP region (screen center) is the NEAR box's red — the near box occludes the far box.
  //    If depth occlusion is broken the far blue bleeds through here.
  const center = getSurfacePixelRgb(surface, cx, cy);
  if (!isRed(center)) {
    throw new Error(
      `[mesh-multiple-depth] overlap center not the near box red — got #${hex(center)} ` +
        `(far box showing through ⇒ depth occlusion broken)`,
    );
  }

  // 2) The near box's exclusive flank (to the RIGHT of center) is red — the near box really is there.
  const right = getSurfacePixelRgb(surface, cx + off, cy);
  if (!isRed(right)) {
    throw new Error(
      `[mesh-multiple-depth] near-box flank (right) not red — got #${hex(right)} (near box missing/misplaced)`,
    );
  }

  // 3) The far box's exclusive flank (to the LEFT of center, not covered by the near box) is blue —
  //    the far box is drawn, just occluded where the boxes overlap.
  const left = getSurfacePixelRgb(surface, cx - off, cy);
  if (!isBlue(left)) {
    throw new Error(
      `[mesh-multiple-depth] far-box flank (left) not blue — got #${hex(left)} (far box missing or fully hidden)`,
    );
  }

  // 4) The four frame corners are background — the boxes are bounded silhouettes, not a full clear.
  const m = Math.floor(surface.width * 0.04);
  for (const [x, y] of [
    [m, m],
    [surface.width - m, m],
    [m, surface.height - m],
    [surface.width - m, surface.height - m],
  ]) {
    if (getSurfacePixelLuminance(surface, x, y) > 40) {
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
