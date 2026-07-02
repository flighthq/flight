import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createDitherEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  defaultGlDitherEffectRunner,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
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

// dither: a full-frame stylization pass applied to the whole scene through a default rgba8 pipeline.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerDefaultGlMaterial(state);
registerGlRenderEffect(state, 'DitherEffect', defaultGlDitherEffectRunner);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createDitherEffect({ levels: 4 })]);
}
