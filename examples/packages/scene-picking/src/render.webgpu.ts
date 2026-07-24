import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLightsLike, SceneNode, WgpuRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  prepareSceneRender,
  registerStandardPbrWgpuMaterial,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
export const canvas = createWgpuCanvasElement(width, height, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x07101dff,
});
registerStandardPbrWgpuMaterial(state);
const pipeline: WgpuRenderEffectPipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});
export const scale = pixelRatio;

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera3D>,
  lights: Readonly<SceneLightsLike>,
): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}
