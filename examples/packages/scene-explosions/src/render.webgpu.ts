import { drawWgpuScene } from '@flighthq/scene-wgpu';
import type { Camera3D, SceneLightsLike, SceneNode, WgpuRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  prepareSceneRender,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { installCaptureTarget } from '@flighthq/tool-capture/browser';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
export const canvas = createWgpuCanvasElement(width, height, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x03040aff,
});

const pipeline: WgpuRenderEffectPipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;

// Headless SwiftShader does not present its WebGPU swapchain. During tool-capture only, opt into the
// SDK readback target so the example publishes the same rendered frame a real browser presents.
let captureInstalled = false;
let captureWarmupFrames = 0;

export function render(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera3D>,
  lights: Readonly<SceneLightsLike>,
): void {
  if (
    !captureInstalled &&
    (window as typeof window & { __flightCapture?: boolean }).__flightCapture === true &&
    ++captureWarmupFrames >= 30
  ) {
    captureInstalled = true;
    void installCaptureTarget({ renderer: 'webgpu', state, scale });
  }
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  prepareSceneRender(state, scene, camera, lights);
  drawWgpuScene(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}
