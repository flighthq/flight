import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createSsrEffect,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlSsrEffectRunner,
  endGlRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerGlRenderEffect,
  registerGlShapeCommands,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

// ssr is depth-driven [DEPTH]. Without a sampleable depth buffer in this test, the Gl recipe is a
// color-only fallback (no reflections traced), passing the scene through.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerDefaultGlMaterial(state);
registerGlRenderEffect(state, 'SsrEffect', defaultGlSsrEffectRunner);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba8',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createSsrEffect({ maxDistance: 0.8, resolution: 0.5, steps: 24 })]);
}
