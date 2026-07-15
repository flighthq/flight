import type { DisplayObject, RenderEffect } from '@flighthq/sdk';
import {
  ShapeKind,
  beginWgpuRenderEffectPipeline,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeCommands,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerStandardWgpuRenderEffects,
  registerWgpuShapeCommands,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  submitWgpuRenderPass,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c14ff,
});

registerDefaultWgpuMaterial(state);
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuShapeCommands(defaultWgpuShapeCommands);
registerStandardWgpuRenderEffects(state);

const pipeline = createWgpuRenderEffectPipeline(state);

export const scale = pixelRatio;

export function render(root: DisplayObject, effects: readonly RenderEffect[]): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuDisplayObject(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, effects);
  submitWgpuRenderPass(state);
}
