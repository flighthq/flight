import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createColorGradeAdjustment,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
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
registerGlStandardMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createColorGradeAdjustment({ saturation: 1.5, contrast: 1.2, temperature: 0.2 }),
  ]);
}

// A spread of distinct, saturated colors so the grade's saturation/contrast/temperature shifts are
// visible across hues rather than on a single tone.

const root = createDisplayObject();
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

// ORACLE-BLOCK
// Color grade with saturation 1.5 increases the channel spread. Cell 1 (green, 0x34c759ff,
// R=52, G=199, B=89) has original spread 147. After 1.5x saturation, the spread should exceed 160.
// Without the effect, spread is 147 < 160 and the assertion fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cx = Math.round(frame.width * 0.5);
  const cy = Math.round(frame.height * 0.32);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);

  if (spread <= 160) {
    throw new Error(
      `[effect-color-grade] green cell spread is ${spread} (expected > 160) — ` +
        `saturation boost not applied; rgb(${r},${g},${b})`,
    );
  }
}
