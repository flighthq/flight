import { createScene } from '@flighthq/scene';
import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera, SceneLights, SceneNode, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera,
  createDirectionalLight,
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
  rotateMatrix4,
  setCameraViewMatrix4FromLookAt,
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

export function render(scene: Readonly<SceneNode>, camera: Readonly<Camera>, lights: Readonly<SceneLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// mesh-transform-rotation — proves a Mesh's `localMatrix` ROTATION reorients the rendered geometry, using
// an ELONGATED box (a bar along the X axis) so orientation is visually unmistakable. Unrotated, the bar is
// WIDE (horizontal); rotated 90° about Z it becomes TALL (vertical). The oracle asserts the silhouette now
// extends vertically and no longer horizontally — a result only a correctly-applied Z rotation can produce.
//
// Camera is head-on (eye at (0,0,4), looking at the origin), so the X bar lies flat in the screen plane and
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

const scene = createScene();
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// THE FEATURE UNDER TEST: rotate the bar 90° about world +Z via its localMatrix. rotateMatrix4 is out-param
// style and takes RADIANS — rotateMatrix4(out, source, axis, radians) — applied in place to the identity.
const zAxis = createVector3(0, 0, 1);
rotateMatrix4(mesh.localMatrix, mesh.localMatrix, zAxis, Math.PI / 2);

// Head-on camera at (0,0,4): the X bar lies in the screen plane; a Z rotation rotates it within the screen.
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
