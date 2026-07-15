import type { DisplayObject, RenderEffect } from '@flighthq/sdk';
import {
  ShapeKind,
  beginCanvasRenderEffectPipeline,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  defaultCanvasBloomEffectRunner,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasToneMapEffectRunner,
  defaultCanvasVignetteEffectRunner,
  endCanvasRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerCanvasRenderEffect,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c14ff,
});

registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
registerCanvasRenderEffect(state, 'BloomEffect', defaultCanvasBloomEffectRunner);
registerCanvasRenderEffect(state, 'VignetteEffect', defaultCanvasVignetteEffectRunner);
registerCanvasRenderEffect(state, 'ToneMapEffect', defaultCanvasToneMapEffectRunner);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;

export function render(root: DisplayObject, effects: readonly RenderEffect[]): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, effects);
}
