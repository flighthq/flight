import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import type { Camera3D, Scene3DLightsLike, Node3D, WgpuRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWgpuFrame,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createWgpuAcquisition,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  enableFlightDiagnostics,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  prepareScene3DRender,
  scene3DWgpuPipeline,
  submitWgpuFrame,
} from '@flighthq/sdk';
import { drawWgpuScene3D, drawWgpuScene3DShadowMap } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
const pipeline: WgpuRenderEffectPipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightsLike>,
  shadowCamera: Readonly<Camera3D>,
): void {
  prepareScene3DRender(state, scene, camera, lights);
  beginWgpuFrame(state);
  drawWgpuScene3DShadowMap(state, scene, shadowCamera, lights.directional);
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear, 'linear');
  drawWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuRenderEffectPipeline(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
  submitWgpuFrame(state);
}
