import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  appendInstancedMeshInstance,
  beginWgpuRenderEffectPipeline,
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
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  scene2dWgpuPipeline,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
  translateMatrix4,
} from '@flighthq/sdk';
import { declareAntialiasingPolicy, declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with three unlit amber (0xe0a030) unit cubes drawn from ONE InstancedMesh, stepping down to the right along an anti-diagonal. With the camera 6 units back and fovY = PI/4, scale s = (H/2)/(6*tan(PI/8)) ≈ 121 px/unit, so the cubes are ≈121 px wide and centred near (W/2 − 2*s, H/2 − s) ≈ (159, 179), (W/2, H/2) = (400, 300), and (W/2 + 2*s, H/2 + s) ≈ (641, 421). The opposite diagonal — (159, 421) and (641, 179) — is background, as are the four corners.',
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

// instanced-mesh-placement — proves ONE InstancedMesh draws its geometry once PER INSTANCE, each at its
// own instance matrix. The three instances are placed on an anti-diagonal (down-and-right) so the picture
// carries both axes: a batch that collapsed every instance onto the node origin would light only the
// centre, and a Y-sign error would put the outer two on the opposite diagonal, which the oracle samples.
//
// Deliberately NOT axis-aligned in a single row: a row of three would look identical under a Y error.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createBoxMeshGeometry(1, 1, 1);
const material = createUnlitMaterial({ baseColor: 0xe0a030ff });

const scene = createScene3D().root;
const batch = createInstancedMesh(geometry, [material], 4);
addNodeChild(scene, batch);

// THE FEATURE UNDER TEST: each append places one instance at its own model matrix.
for (const [x, y] of [
  [-2, 1],
  [0, 0],
  [2, -1],
] as const) {
  const matrix = createMatrix4();
  translateMatrix4(matrix, matrix, x, y, 0);
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
  assertPlacement(bitmap, 'instanced-mesh-placement');
}

function assertPlacement(bitmap: Readonly<Bitmap>, scene: string): void {
  const w = bitmap.width;
  const h = bitmap.height;
  // s = (h/2) / (6 * tan(fovY/2)); the cubes sit at world (±2, ∓1, 0).
  const s = h / 2 / (6 * Math.tan(Math.PI / 8));
  const centers: readonly (readonly [number, number])[] = [
    [Math.round(w / 2 - 2 * s), Math.round(h / 2 - s)],
    [Math.round(w / 2), Math.round(h / 2)],
    [Math.round(w / 2 + 2 * s), Math.round(h / 2 + s)],
  ];

  // 1) Every instance is drawn at its OWN matrix. A batch that dropped its per-instance transforms
  //    would light one position at most.
  for (let i = 0; i < centers.length; i++) {
    const [x, y] = centers[i]!;
    const rgb = getBitmapPixelRgb(bitmap, x, y);
    if (!isAmber(rgb)) {
      throw new Error(
        `[${scene}] instance ${i} is missing at (${x}, ${y}) — got #${hex(rgb)}; the batch did not draw each instance at its own matrix`,
      );
    }
  }

  // 2) The OPPOSITE diagonal is background. This is what fails on a Y-sign error: the outer instances
  //    would land here instead, and every "three blobs are lit" check would still pass.
  for (const [x, y] of [
    [Math.round(w / 2 - 2 * s), Math.round(h / 2 + s)],
    [Math.round(w / 2 + 2 * s), Math.round(h / 2 - s)],
  ] as const) {
    if (getBitmapPixelLuminance(bitmap, x, y) > 40) {
      throw new Error(`[${scene}] (${x}, ${y}) is lit — the instance column/row is mirrored in Y`);
    }
  }

  // 3) The corners stay background, so the batch is three bounded cubes and not a full-frame fill.
  for (const [x, y] of [
    [4, 4],
    [w - 5, 4],
    [4, h - 5],
    [w - 5, h - 5],
  ] as const) {
    if (getBitmapPixelLuminance(bitmap, x, y) > 40) {
      throw new Error(`[${scene}] corner (${x}, ${y}) is lit — the batch is not bounded`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isAmber(rgb: number): boolean {
  // 0xe0a030: strong red, mid green, low blue.
  return channel(rgb, 16) > 150 && channel(rgb, 8) > 80 && channel(rgb, 0) < 110;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
