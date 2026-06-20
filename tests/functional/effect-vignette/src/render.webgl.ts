import type { DisplayObject, WebGLRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWebGLRenderEffectPipeline,
  createVignetteEffect,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  defaultWebGLVignetteEffectRunner,
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

// Vignette: a full-bleed bright fill darkened toward the corners. The center stays bright while the
// edges fall off, so the radial darkening is obvious against the flat fill.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
registerDefaultWebGLMaterial(state);
registerWebGLRenderEffect(state, 'vignette', defaultWebGLVignetteEffectRunner);

const pipeline: WebGLRenderEffectPipeline = createWebGLRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginWebGLRenderEffectPipeline(state, pipeline);
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  endWebGLRenderEffectPipeline(state, pipeline, [createVignetteEffect({ intensity: 1, radius: 0.7, softness: 0.5 })]);
}
