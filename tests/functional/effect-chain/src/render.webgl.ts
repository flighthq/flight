import type { DisplayObject, WebGLRenderEffectPipeline } from '@flighthq/sdk';
import {
  beginWebGLRenderEffectPipeline,
  createBloomEffect,
  createColorGradeEffect,
  createVignetteEffect,
  createWebGLCanvasElement,
  createWebGLRenderEffectPipeline,
  createWebGLRenderState,
  defaultWebGLBloomEffectRunner,
  defaultWebGLColorGradeEffectRunner,
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

// Effect chain: a STACK of three effects runs in one pipeline — bloom, then color grade, then
// vignette. The pipeline ping-pongs between offscreen targets so each stage reads the previous
// stage's output, proving multi-stage ordering. HDR (rgba16f) keeps the bright pass for bloom.
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
registerWebGLRenderEffect(state, 'bloom', defaultWebGLBloomEffectRunner);
registerWebGLRenderEffect(state, 'colorGrade', defaultWebGLColorGradeEffectRunner);
registerWebGLRenderEffect(state, 'vignette', defaultWebGLVignetteEffectRunner);

const pipeline: WebGLRenderEffectPipeline = createWebGLRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginWebGLRenderEffectPipeline(state, pipeline);
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
  endWebGLRenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeEffect({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
}
