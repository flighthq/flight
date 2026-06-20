import type { DisplayObject, WebGLRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWebGLRenderEffectPipeline,
  createSMAAEffect,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  defaultWebGLSMAAEffectRunner,
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

// SMAA antialiases the whole frame. This is a single-pass approximation of SMAA (not the full
// edge/blend-weight/neighborhood three-pass), smoothing the jagged diagonal edges.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
registerDefaultWebGLMaterial(state);
registerWebGLRenderEffect(state, 'smaa', defaultWebGLSMAAEffectRunner);

const pipeline: WebGLRenderEffectPipeline = createWebGLRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba8',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginWebGLRenderEffectPipeline(state, pipeline);
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  endWebGLRenderEffectPipeline(state, pipeline, [createSMAAEffect({ threshold: 0.1 })]);
}
