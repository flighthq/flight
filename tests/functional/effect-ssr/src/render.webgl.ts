import type { DisplayObject, WebGLRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWebGLRenderEffectPipeline,
  createSSREffect,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  defaultWebGLShapeCommands,
  defaultWebGLShapeRenderer,
  defaultWebGLSSREffectRunner,
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

// ssr is depth-driven [DEPTH]. Without a sampleable depth buffer in this test, the WebGL recipe is a
// color-only fallback (no reflections traced), passing the scene through.
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
registerWebGLRenderEffect(state, 'ssr', defaultWebGLSSREffectRunner);

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
  endWebGLRenderEffectPipeline(state, pipeline, [createSSREffect({ maxDistance: 0.8, resolution: 0.5, steps: 24 })]);
}
