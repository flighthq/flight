import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createBoxMeshGeometry,
  createMesh,
  createPerspectiveProjection,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWireframeMaterial,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuWireframeMaterial,
  renderWgpuBackground,
  setCamera3DJitter,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with a white (0xffffff) wireframe cube centered at (0.5*W, 0.5*H) = (400, 300). The cube uses a deliberate one-point perspective pose, not an arbitrary rotation: the camera is 2.5 units from a unit cube and its 480 px focal length projects the near face to a 240×240 square and the far face to a separate 160×160 square. Their corresponding corners join on four depth edges, so all 12 outer edges remain distinguishable instead of collapsing into one straight-on square. Every outer corner and edge midpoint lands on a controlled integer pixel coordinate before a deliberate half-pixel projection phase. Only thin triangle edges are visible against the dark background — no filled faces or shading gradient; the six face diagonals are visible because the cube faces are triangulated. Frame corners are dark background.',
);

// drawWgpuScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same cube as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (Wireframe writes linear HDR into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerWgpuWireframeMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
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

// material-wireframe — proves a WireframeMaterial mesh renders only its triangle EDGES as lines on the
// Gl and Wgpu forward renderers, independent of scene lighting. A single cube sits at the origin;
// WireframeMaterial ignores lighting and draws each triangle's edges as 1px lines in a solid color,
// leaving the triangle interiors empty (background). The result is a mesh of bright lines over the dark
// background — NOT solid filled faces.
//
// thickness > 1 is unsupported (the backends draw 1px lines), so the wireframe reads as thin bright
// strokes separated by dark interior pixels.
//
// The signature the assertion checks: every one of the 12 outer-edge midpoints has a bright line nearby,
// while the projected cube bounds still contain dark interior samples. A solid fill would remove the dark
// samples; a blank surface or collapsed edge would miss a midpoint.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);

// White edges, 1px thick (thickness > 1 is unsupported; the backends draw 1px lines). Lighting-independent.
const material = createWireframeMaterial({ color: 0xffffffff });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// The one-point perspective is derived for the pixel lattice. A 480 px focal length with the camera at
// z=2.5 projects the near z=+0.5 face to half-size 120 px and the far z=-0.5 face to half-size 80 px.
// The nested squares are distinct, their four depth edges have slopes ±5 and ±1/5, and all outer
// endpoints are integers before the shared half-pixel phase.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({
    aspect: logicalWidth / logicalHeight,
    fovY: 2 * Math.atan(5 / 8),
  }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 2.5), createVector3(0, 0, 0), createVector3(0, 1, 0));
setCamera3DJitter(camera, 1 / logicalWidth, -1 / logicalHeight);

// The same directional + ambient rig as material-standard-pbr. WireframeMaterial ignores both — they are
// passed through unused so the scaffold matches the lit materials.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
});

render(scene, camera, lights);

// Assertion: all 12 cube edges render as separate projected segments, but the cube is not a solid fill.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  let edgeCount = 0;
  for (const varyingAxis of [0, 1, 2]) {
    for (const firstSign of [-1, 1]) {
      for (const secondSign of [-1, 1]) {
        const point: [number, number, number] = [0, 0, 0];
        point[(varyingAxis + 1) % 3] = firstSign * 0.5;
        point[(varyingAxis + 2) % 3] = secondSign * 0.5;
        const distance = 2.5 - point[2];
        const expectedX = Math.round(cx + (480 * point[0]) / distance);
        const expectedY = Math.round(cy - (480 * point[1]) / distance);
        if (hasBrightPixel(bitmap, expectedX, expectedY, 2)) edgeCount++;
      }
    }
  }
  if (edgeCount !== 12) {
    throw new Error(
      `[material-wireframe] only ${edgeCount}/12 distinguishable cube edges reached their projected midpoints`,
    );
  }

  let darkCount = 0;
  for (let y = cy - 108; y <= cy + 108; y += 12) {
    for (let x = cx - 108; x <= cx + 108; x += 12) {
      if (getBitmapPixelLuminance(bitmap, x, y) <= 20) darkCount++;
    }
  }
  if (darkCount === 0) {
    throw new Error(
      '[material-wireframe] no dark samples inside the projected cube bounds — bitmap appears solid-filled',
    );
  }
}

function hasBrightPixel(bitmap: Readonly<Bitmap>, cx: number, cy: number, radius: number): boolean {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (getBitmapPixelLuminance(bitmap, x, y) > 40) return true;
    }
  }
  return false;
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
