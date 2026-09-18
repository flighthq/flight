import {
  webHostWgpuContext,
  appendWebSurface,
  getWebSurfaceElement,
  setWebSurfaceDisplaySize,
} from '@flighthq/host-web';
import type { Camera3D, Node3D, RenderEffect, Scene3DLightsLike, WgpuRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  enableFlightDiagnostics,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  prepareScene3DRender,
  registerWgpuBloomEffect,
  registerWgpuToneMapEffect,
  registerWgpuVignetteEffect,
  scene3DWgpuPipeline,
  createWgpuSurface,
} from '@flighthq/sdk';
import { drawWgpuScene3D } from '@flighthq/sdk/rendering';

const pixelRatio = window.devicePixelRatio || 1;
export const width = 800;
export const height = 600;
const wgpuSurface = await createWgpuSurface(webHostWgpuContext, width * pixelRatio, height * pixelRatio);
if (wgpuSurface === null) throw new Error('WebGPU is unavailable in this environment');
setWebSurfaceDisplaySize(wgpuSurface, width, height);
appendWebSurface(wgpuSurface, document.body);
export const canvas = getWebSurfaceElement(wgpuSurface)!;
const target = wgpuSurface.target;
const acquisition = wgpuSurface.acquisition;
export const screen = createWgpuScreenRenderTarget(webHostWgpuContext, acquisition.device, target, {
  format: acquisition.format,
});
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
// What the frame is cleared to, named once: it is a per-pass value now, not a render-state field.
const screenClear = { color: [0x09 / 0xff, 0x07 / 0xff, 0x0a / 0xff, 1], depth: 1.0 } as const;
enableFlightDiagnostics(state);
registerWgpuBloomEffect(state);
registerWgpuToneMapEffect(state);
registerWgpuVignetteEffect(state);

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
  effects: readonly RenderEffect[],
): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuRenderEffectPipeline(scenePass, pipeline, effects);
  endWgpuRenderPass(pass);
}
