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
  createPerspectiveProjection,
  createScene3DLights,
  createUnlitMaterial,
  createVector3,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  setCamera3DViewMatrix4FromLookAt,
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
  'An 800x600 dark field (0x0a0c10) with four unit cubes in a row from TWO separate InstancedMesh batches: amber (0xe0a030) on the left pair and teal (0x30c0a0) on the right pair. With the camera 7 units back and fovY = PI/4, scale s = (H/2)/(7*tan(PI/8)) ~= 104 px/unit, so each cube is ~104 px wide, centred near x = W/2 - 2.6*s ~= 130, W/2 - 0.9*s ~= 307, W/2 + 0.9*s ~= 493 and W/2 + 2.6*s ~= 670, all at y = H/2 = 300. The amber pair is left of centre and the teal pair right of it; the four corners are background.',
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

// instanced-mesh-batches — TWO InstancedMesh batches in one frame, each with its own instance matrices and its own
// colour. Backends that stage per-instance data through a single shared GPU buffer rewritten between
// draws render every batch with whichever batch was written LAST, because the whole frame is recorded
// into one render pass and submitted once — so both pairs would land on one pair's positions.
//
// The two batches are interleaved left/right rather than stacked, so a collapse leaves half the row
// empty and doubles the other half: visible as a missing colour, which the oracle checks per position.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);

const scene = createScene3D().root;

function addBatch(color: number, xs: readonly number[]): void {
  const batch = createInstancedMesh(geometry, [createUnlitMaterial({ baseColor: color })], 4);
  addNodeChild(scene, batch);
  for (const x of xs) {
    const matrix = createMatrix4();
    translateMatrix4(matrix, matrix, x, 0, 0);
    appendInstancedMeshInstance(batch, matrix);
  }
}

// THE FEATURE UNDER TEST: two batches, each keeping its own instance placement.
addBatch(0xe0a030ff, [-2.6, -0.9]);
addBatch(0x30c0a0ff, [0.9, 2.6]);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 7), createVector3(0, 0, 0), createVector3(0, 1, 0));

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
  const s = h / 2 / (7 * Math.tan(Math.PI / 8));
  const y = Math.round(h / 2);

  // Each position must carry ITS OWN batch's colour. Checking presence alone would pass when both
  // batches render at one batch's matrices, because that still lights two of the four positions.
  const expected: readonly (readonly [number, string])[] = [
    [-2.6, 'amber'],
    [-0.9, 'amber'],
    [0.9, 'teal'],
    [2.6, 'teal'],
  ];
  for (const [offset, want] of expected) {
    const x = Math.round(w / 2 + offset * s);
    const rgb = getBitmapPixelRgb(bitmap, x, y);
    const got = isAmber(rgb) ? 'amber' : isTeal(rgb) ? 'teal' : `#${hex(rgb)}`;
    if (got !== want) {
      throw new Error(
        `[instanced-mesh-batches] position x=${offset} should be ${want} but is ${got} — the two batches did not each keep their own instance data`,
      );
    }
  }

  // The corners stay background, so the row is four bounded cubes rather than a fill that would satisfy
  // a colour check by covering everything.
  for (const [x, cy] of [
    [4, 4],
    [w - 5, 4],
    [4, h - 5],
    [w - 5, h - 5],
  ] as const) {
    if (getBitmapPixelLuminance(bitmap, x, cy) > 40) {
      throw new Error(`[instanced-mesh-batches] corner (${x}, ${cy}) is lit — the batches are not bounded`);
    }
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
