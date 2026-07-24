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
  createMesh,
  createOrthographicProjection,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareSceneRender,
  registerUnlitWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

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

// WebGPU parity proof for camera-orthographic.webgl.ts. The two identical cubes occupy different
// camera depths but must retain equal silhouette widths under an orthographic projection. It also
// proves the GL-convention camera matrix is remapped into WebGPU's [0, 1] NDC-Z range: before the
// correction this scene was entirely clipped.
const logicalWidth = width / scale;
const logicalHeight = height / scale;
const aspect = logicalWidth / logicalHeight;
const scene = createScene().root;

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
const lights = {
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 1 }),
};

render(scene, camera, lights);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  const cy = Math.floor(surface.height / 2);
  const backgroundLuminance = getSurfacePixelLuminance(surface, 0, 0);
  const leftWidth = widestLitRun(surface, cy, 0, cx, backgroundLuminance);
  const rightWidth = widestLitRun(surface, cy, cx, surface.width, backgroundLuminance);
  const minPixels = Math.floor(surface.width * 0.05);

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
  surface: Readonly<Surface>,
  y: number,
  xStart: number,
  xEnd: number,
  backgroundLuminance: number,
): number {
  let best = 0;
  let run = 0;
  for (let x = xStart; x < xEnd; x++) {
    if (Math.abs(getSurfacePixelLuminance(surface, x, y) - backgroundLuminance) > 10) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}
