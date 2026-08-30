import type { Camera3D, Scene3DLightsLike, Node3D, WgpuRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  beginWgpuFrame,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  enableFlightDiagnostics,
  endWgpuRenderEffectPipeline,
  prepareScene3DRender,
  registerWgpuStandardPbrMaterial,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { drawWgpuScene3D, drawWgpuScene3DShadowMap } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
enableFlightDiagnostics(state);
registerWgpuStandardPbrMaterial(state);

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
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}
