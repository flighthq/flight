import type { Node2D, RenderEffect } from '@flighthq/sdk';
import {
  ShapeKind,
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerStandardGlMaterial,
  registerGlShapeCommands,
  registerRenderer,
  registerStandardGlRenderEffects,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
export const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c14ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});

registerStandardGlMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerStandardGlRenderEffects(state);

const pipeline = createGlRenderEffectPipeline(state);

export const scale = pixelRatio;

export function render(root: Node2D, effects: readonly RenderEffect[]): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, effects);
}
