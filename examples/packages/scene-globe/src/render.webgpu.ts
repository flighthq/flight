import type { Camera3D, Environment, Scene3DLightsLike, Node3D, WgpuRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
  enableFlightDiagnostics,
  endWgpuRenderEffectPipeline,
  prepareScene3DRender,
  registerWgpuStandardPbrMaterial,
  registerStandardWgpuTextureResolvers,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { drawWgpuEnvironmentSkybox, drawWgpuScene3D } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
export const canvas = createWgpuCanvasElement(width, height, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x02040cff,
});
enableFlightDiagnostics(state);
registerWgpuStandardPbrMaterial(state);
registerStandardWgpuTextureResolvers(state);

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
  environment: Readonly<Environment>,
): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  drawWgpuEnvironmentSkybox(state, environment, camera, width / height);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}
