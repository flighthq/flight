import type { Node2D, RenderEffect } from '@flighthq/sdk';
import {
  ShapeKind,
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  enableFlightDiagnostics,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  defaultWgpuBloomEffectRunner,
  defaultWgpuToneMapEffectRunner,
  defaultWgpuVignetteEffectRunner,
  defaultWgpuWhiteBalanceEffectRunner,
  registerStandardWgpuMaterial,
  registerWgpuRenderEffect,
  registerWgpuShapeCommands,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c14ff,
});
enableFlightDiagnostics(state);

registerStandardWgpuMaterial(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerWgpuRenderEffect(state, 'BloomEffect', defaultWgpuBloomEffectRunner);
registerWgpuRenderEffect(state, 'VignetteEffect', defaultWgpuVignetteEffectRunner);
registerWgpuRenderEffect(state, 'ToneMapEffect', defaultWgpuToneMapEffectRunner);
registerWgpuRenderEffect(state, 'WhiteBalanceEffect', defaultWgpuWhiteBalanceEffectRunner);

const pipeline = createWgpuRenderEffectPipeline(state);

export const scale = pixelRatio;

export function render(root: Node2D, effects: readonly RenderEffect[]): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, effects);
  submitWgpuRenderPass(state);
}
