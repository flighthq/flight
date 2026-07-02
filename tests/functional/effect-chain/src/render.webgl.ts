import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createBloomEffect,
  createColorGradeEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createVignetteEffect,
  defaultGlBloomEffectRunner,
  defaultGlColorGradeEffectRunner,
  defaultGlShapeCommands,
  defaultGlShapeRenderer,
  defaultGlVignetteEffectRunner,
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

// Effect chain: a STACK of three effects runs in one pipeline — bloom, then color grade, then
// vignette. The pipeline ping-pongs between offscreen targets so each stage reads the previous
// stage's output, proving multi-stage ordering. HDR (rgba16f) keeps the bright pass for bloom.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlShapeCommands(defaultGlShapeCommands);
registerDefaultGlMaterial(state);
registerGlRenderEffect(state, 'BloomEffect', defaultGlBloomEffectRunner);
registerGlRenderEffect(state, 'ColorGradeEffect', defaultGlColorGradeEffectRunner);
registerGlRenderEffect(state, 'VignetteEffect', defaultGlVignetteEffectRunner);

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
  endGlRenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeEffect({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
}
