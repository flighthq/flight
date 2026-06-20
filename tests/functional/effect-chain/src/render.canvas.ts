import type { DisplayObject } from '@flighthq/sdk';
import {
  beginCanvasRenderEffectPipeline,
  createBloomEffect,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createColorGradeEffect,
  createVignetteEffect,
  defaultCanvasBloomEffectRunner,
  defaultCanvasColorGradeEffectRunner,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  defaultCanvasVignetteEffectRunner,
  endCanvasRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerCanvasRenderEffect,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

// Canvas parity column for the same three-stage chain as render.webgl.ts: bloom, then color grade,
// then vignette. The Canvas pipeline composites each registered runner in order over the scene, the
// same RenderEffect stack intent realized with Canvas 2D compositing.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
registerCanvasRenderEffect(state, 'bloom', defaultCanvasBloomEffectRunner);
registerCanvasRenderEffect(state, 'colorGrade', defaultCanvasColorGradeEffectRunner);
registerCanvasRenderEffect(state, 'vignette', defaultCanvasVignetteEffectRunner);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeEffect({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
}
