import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  appendInstancedMeshInstance,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createInstancedMesh,
  createMatrix4,
  createMesh,
  createPerspectiveProjection,
  createScene3DLights,
  createUnlitMaterial,
  createVector3,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  setCamera3DViewMatrix4FromLookAt,
  setNodeLocalMatrix4,
  translateMatrix4,
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  endWgpuRenderEffectPipeline,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  scene2dWgpuPipeline,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareAntialiasingPolicy, declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 dark field (0x0a0c10) carrying a teal (0x30c0a0) reference cube at bottom centre near (W/2, H/2 + 1.6*s) and two amber (0xe0a030) cubes from ONE InstancedMesh whose NODE sits 60 units to the right of view, at (W/2 - 2*s, H/2 - 0.9*s) and (W/2 + 2*s, H/2 - 0.9*s). With the camera 6 units back and fovY = PI/4, scale s = (H/2)/(6*tan(PI/8)) ~= 121 px/unit, so each cube is ~121 px wide: the amber pair is near (159, 191) and (641, 191), the teal reference near (400, 494). The frame centre is background.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuUnlitMaterial(state);

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

// instanced-mesh-offscreen-origin — the batch's NODE is parked 60 units off to the right, far outside the view frustum, while
// its instance matrices bring every instance back in front of the camera. An instance is drawn at
// `nodeWorld * instanceMatrix`, so the batch belongs on screen; culling it against the geometry bounds at
// the NODE origin alone throws the whole batch away while it is fully in view.
//
// The teal cube is a directly-drawn ordinary Mesh, present in every cell, so a culled batch reads as
// "the amber pair is missing" rather than as a blank frame that could mean anything.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);
const batchMaterial = createUnlitMaterial({ baseColor: 0xe0a030ff });
const referenceMaterial = createUnlitMaterial({ baseColor: 0x30c0a0ff });

const scene = createScene3D().root;

// The reference: an ordinary Mesh at bottom centre, unaffected by instanced culling.
const reference = createMesh(geometry, [referenceMaterial]);
const referenceLocal = createMatrix4();
translateMatrix4(referenceLocal, referenceLocal, 0, -1.6, 0);
setNodeLocalMatrix4(reference, referenceLocal);
addNodeChild(scene, reference);

// THE FEATURE UNDER TEST: node far off to the right, instances translated back into view.
const NODE_OFFSET_X = 60;
const batch = createInstancedMesh(geometry, [batchMaterial], 4);
const batchLocal = createMatrix4();
translateMatrix4(batchLocal, batchLocal, NODE_OFFSET_X, 0, 0);
setNodeLocalMatrix4(batch, batchLocal);
addNodeChild(scene, batch);

for (const x of [-2, 2]) {
  const matrix = createMatrix4();
  translateMatrix4(matrix, matrix, x - NODE_OFFSET_X, 0.9, 0);
  appendInstancedMeshInstance(batch, matrix);
}

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 6), createVector3(0, 0, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const w = bitmap.width;
  const h = bitmap.height;
  const s = h / 2 / (6 * Math.tan(Math.PI / 8));

  // 1) The reference Mesh is present. If this fails the scene itself is broken, and the instanced
  //    assertions below would be reporting on a frame that never rendered anything.
  const reference = getBitmapPixelRgb(bitmap, Math.round(w / 2), Math.round(h / 2 + 1.6 * s));
  if (!isTeal(reference)) {
    throw new Error(
      `[instanced-mesh-offscreen-origin] the reference cube is missing — got #${hex(reference)}; the scene did not render`,
    );
  }

  // 2) Both instances are on screen. This is what a node-origin cull throws away: the node is 60 units
  //    right of the frustum, so the batch is dropped even though every instance is in view.
  for (const [i, x] of [Math.round(w / 2 - 2 * s), Math.round(w / 2 + 2 * s)].entries()) {
    const y = Math.round(h / 2 - 0.9 * s);
    const rgb = getBitmapPixelRgb(bitmap, x, y);
    if (!isAmber(rgb)) {
      throw new Error(
        `[instanced-mesh-offscreen-origin] instance ${i} is missing at (${x}, ${y}) — got #${hex(rgb)}; the batch was culled against its node origin rather than its instance extent`,
      );
    }
  }

  // 3) The frame centre stays background — the batch is two bounded cubes, not a full-frame fill that
  //    would satisfy check 2 by accident.
  if (getBitmapPixelLuminance(bitmap, Math.round(w / 2), Math.round(h / 2)) > 40) {
    throw new Error(
      `[instanced-mesh-offscreen-origin] the frame centre is lit — the batch is not bounded to its two instances`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isAmber(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) > 80 && channel(rgb, 0) < 110;
}
function isTeal(rgb: number): boolean {
  return channel(rgb, 8) > 130 && channel(rgb, 8) > channel(rgb, 16) + 50 && channel(rgb, 0) > 80;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
