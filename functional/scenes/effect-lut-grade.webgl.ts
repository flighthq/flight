import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  getBitmapPixelRgb,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createLookupTableGradeAdjustment,
  createShape,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

// Full-frame lutGrade color grade: applies a 32^3 lookup-table grade at full strength. One config applied to the whole scene through an
// rgba8 effect pipeline (the default format for color ops, so format is omitted).
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x202830ff,
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
  endGlRenderEffectPipeline(state, pipeline, [createLookupTableGradeAdjustment({ strength: 1 })]);
}

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// applies a 32^3 lookup-table grade at full strength.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff3030ff, 0x30c040ff, 0x3060ffff, 0xffd030ff, 0xff30c0ff, 0x30d0d0ff];
const cols = 3;
const rows = 2;
const cellWidth = logicalWidth / cols;
const cellHeight = logicalHeight / rows;
for (let i = 0; i < colors.length; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, 0, 0, cellWidth, cellHeight);
  appendShapeEndFill(shape);
  shape.x = col * cellWidth;
  shape.y = row * cellHeight;
  addNodeChild(root, shape);
}

render(root);

// ORACLE-BLOCK
// LUT color grading remaps every pixel through a lookup table at strength 1. Cell 0 (red,
// 0xff3030ff, R=255, G=48, B=48) should have at least one channel differ by >= 15 from its original
// value. Without the effect, all channels match the input and the maximum change is 0.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const cx = Math.round(((0 + 0.5) * frame.width) / cols);
  const cy = Math.round(((0 + 0.5) * frame.height) / rows);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const maxChange = Math.max(Math.abs(r - 255), Math.abs(g - 48), Math.abs(b - 48));

  if (maxChange < 15) {
    throw new Error(
      `[effect-lut-grade] red cell rgb(${r},${g},${b}) is within 15 of original (255,48,48) — ` +
        `LUT grading not applied`,
    );
  }
}
