import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGrayscaleAdjustment,
  createShape,
  defaultGlShapeRenderer,
  getBitmapPixelRgb,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'Six shades of neutral gray in a 3×2 grid filling the 800×600 frame (cells ~267×300 px; columns at x 0/267/533, rows at y 0/300). Top row left to right: dark gray (from red 0xff3030), medium gray (from green 0x30c040), medium-dark gray (from blue 0x3060ff); bottom row: light gray (from yellow 0xffd030), medium gray (from magenta 0xff30c0), medium gray (from cyan 0x30d0d0). Each cell is a single flat tone with no color — all saturation removed. No gaps between cells.',
);

// Full-frame grayscale color grade: fully desaturates the frame to luminance. One config applied to the whole scene through an
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
  endGlRenderEffectPipeline(state, pipeline, [createGrayscaleAdjustment({ intensity: 1 })]);
}

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// fully desaturates the frame to luminance.

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

export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const labels = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];
  const grays: number[] = [];

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(((col + 0.5) * frame.width) / cols);
    const cy = Math.round(((row + 0.5) * frame.height) / rows);
    const rgb = getBitmapPixelRgb(frame, cx, cy);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread >= 5) {
      throw new Error(`[effect-grayscale] ${labels[i]} cell not grayscale — rgb(${r},${g},${b}), spread=${spread}`);
    }
    grays.push(r);
  }

  const distinct: number[] = [];
  for (const v of grays) {
    if (!distinct.some((d) => Math.abs(d - v) < 10)) {
      distinct.push(v);
    }
  }
  if (distinct.length < 3) {
    throw new Error(
      `[effect-grayscale] expected >= 3 distinct luminance levels, got ${distinct.length} — values: ${grays.join(', ')}`,
    );
  }
}
