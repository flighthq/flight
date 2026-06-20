import type { DisplayObject } from '@flighthq/sdk';
import {
  beginCanvasRenderEffectPipeline,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createColorGradeEffect,
  defaultCanvasColorGradeEffectRunner,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  endCanvasRenderEffectPipeline,
  prepareDisplayObjectRender,
  registerCanvasRenderEffect,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

// Canvas parity column for the same color-grade intent as render.webgl.ts: saturation, contrast, and
// a warm temperature shift across the whole frame — realized with Canvas 2D compositing.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
registerCanvasRenderEffect(state, 'colorGrade', defaultCanvasColorGradeEffectRunner);

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
    createColorGradeEffect({ saturation: 1.5, contrast: 1.2, temperature: 0.2 }),
  ]);
}
