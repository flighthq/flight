import type { DisplayObject, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createColorGradeEffect,
  createDisplayContainer,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  defaultGlColorGradeEffectRunner,
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
} from '@flighthq/sdk';

// Color grade: a single grade pass pushes saturation, contrast, and a warm temperature shift across
// the whole frame. Colorful source shapes make the saturation and contrast changes easy to read.
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
registerGlRenderEffect(state, 'ColorGradeEffect', defaultGlColorGradeEffectRunner);

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
    createColorGradeEffect({ saturation: 1.5, contrast: 1.2, temperature: 0.2 }),
  ]);
}

// A spread of distinct, saturated colors so the grade's saturation/contrast/temperature shifts are
// visible across hues rather than on a single tone.

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3b30ff, 0x34c759ff, 0x007affff, 0xffcc00ff, 0xaf52deff, 0xff9500ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -60, -80, 120, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.18 + 0.32 * (i % 3));
  shape.y = logicalHeight * (0.32 + 0.4 * Math.floor(i / 3));
  addNodeChild(root, shape);
}

render(root);
