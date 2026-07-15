import type { DisplayObject, RenderEffect } from '@flighthq/sdk';
import {
  ShapeKind,
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMatrix,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlShapeCommands,
  registerRenderer,
  registerStandardGlRenderEffects,
  renderGlBackground,
  renderGlDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c14ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});

state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

registerDefaultGlMaterial(state);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerStandardGlRenderEffects(state);

const pipeline = createGlRenderEffectPipeline(state);

export const scale = pixelRatio;

export function render(root: DisplayObject, effects: readonly RenderEffect[]): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, effects);
}
