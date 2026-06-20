import type { DisplayObject, WebGLRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWebGLRenderEffectPipeline,
  createFilmGrainEffect,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  defaultWebGLFilmGrainEffectRunner,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  endWebGLRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  registerWebGLRenderEffect,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

// Film grain: per-pixel noise is mixed over the frame. A flat mid-gray fill is the cleanest backdrop —
// the grain shows as fine speckle that would be invisible over busy content. Fixed seed keeps the
// static capture deterministic.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x808080ff,
});
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
registerDefaultWebGLMaterial(state);
registerWebGLRenderEffect(state, 'filmGrain', defaultWebGLFilmGrainEffectRunner);

const pipeline: WebGLRenderEffectPipeline = createWebGLRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginWebGLRenderEffectPipeline(state, pipeline);
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  endWebGLRenderEffectPipeline(state, pipeline, [createFilmGrainEffect({ intensity: 0.3, size: 1.5, seed: 7 })]);
}
