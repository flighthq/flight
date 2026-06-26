import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createBokehDepthOfFieldEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  defaultGlBokehDepthOfFieldEffectRunner,
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

// Bokeh depth-of-field [DEPTH]: shapes near the focus distance stay sharp while out-of-focus
// shapes spread into soft bokeh discs. Gl drives the circle-of-confusion from the depth target.
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
registerGlRenderEffect(state, 'BokehDepthOfFieldEffect', defaultGlBokehDepthOfFieldEffectRunner);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createBokehDepthOfFieldEffect({ focusDistance: 0.5, focusRange: 0.15, maxBlur: 6 }),
  ]);
}
