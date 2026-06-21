import type { DisplayObject, WebGLRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWebGLRenderEffectPipeline,
  createBloomEffect,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  defaultWebGLBloomEffectRunner,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  enableWebGLClipSupport,
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

// WebGL parity column: the same triangular contour clip inside an HDR (rgba16f) bloom pipeline. The
// contour clip is realized by a stencil pass, so the effect pipeline's scene target is created with a
// depth-stencil buffer (depth: 'depth-stencil').
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
enableWebGLClipSupport(state);
registerWebGLRenderEffect(state, 'bloom', defaultWebGLBloomEffectRunner);

const pipeline: WebGLRenderEffectPipeline = createWebGLRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginWebGLRenderEffectPipeline(state, pipeline);
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  endWebGLRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.4, intensity: 1.3 })]);
}
