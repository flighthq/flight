import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createBloomEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  defaultGlBloomEffectRunner,
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

// MSAA + bloom together: the pipeline uses a multisampled HDR (rgba16f) target with sampleCount 4 and
// also runs a bloom stage. This proves the MSAA-resolve and the effect-compose paths cooperate — the
// rotated shapes' edges resolve smooth while their bright interiors still bloom a soft halo.
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
registerGlRenderEffect(state, 'bloom', defaultGlBloomEffectRunner);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.6, intensity: 1.4 })]);
}
