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
  createMesh,
  createOrthographicProjection,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

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

// WebGPU parity proof for camera-orthographic.webgl.ts. The two identical cubes occupy different
// camera depths but must retain equal silhouette widths under an orthographic projection. It also
// proves the GL-convention camera matrix is remapped into WebGPU's [0, 1] NDC-Z range: before the
// correction this scene was entirely clipped.
const logicalWidth = width / scale;
const logicalHeight = height / scale;
const aspect = logicalWidth / logicalHeight;
const scene = createScene3D().root;

const leftMesh = createMesh(createBoxMeshGeometry(1, 1, 1), [createUnlitMaterial({ baseColor: 0xe0c040ff })]);
setVector3(leftMesh.position, -1.2, 0, 1.5);
invalidateNodeLocalTransform(leftMesh);
addNodeChild(scene, leftMesh);

const rightMesh = createMesh(createBoxMeshGeometry(1, 1, 1), [createUnlitMaterial({ baseColor: 0x40b0e0ff })]);
setVector3(rightMesh.position, 1.2, 0, -1.5);
invalidateNodeLocalTransform(rightMesh);
addNodeChild(scene, rightMesh);

const halfWidth = 3;
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: halfWidth / aspect, halfWidth }),
});
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
  const leftWidth = widestLitRun(bitmap, cy, 0, cx, backgroundLuminance);
  const rightWidth = widestLitRun(bitmap, cy, cx, bitmap.width, backgroundLuminance);
  const minPixels = Math.floor(bitmap.width * 0.05);

  if (leftWidth < minPixels || rightWidth < minPixels) {
    throw new Error(`[camera-orthographic] WebGPU silhouettes missing — near ${leftWidth}px, far ${rightWidth}px`);
  }
  const ratio = Math.min(leftWidth, rightWidth) / Math.max(leftWidth, rightWidth);
  if (ratio < 0.85) {
    throw new Error(
      `[camera-orthographic] WebGPU box widths differ with depth — near ${leftWidth}px vs far ${rightWidth}px`,
    );
  }
}

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
