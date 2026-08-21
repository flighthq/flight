import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginCanvasRenderEffectPipeline,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createDisplayObject,
  createInvertAdjustment,
  createShape,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  endCanvasRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'Six rectangles in a 3×2 grid filling the 800×600 frame (cells ~267×300 px; columns at x 0/267/533, rows at y 0/300), showing complementary colors of the source: red (0xff3030) inverts to cyan, green (0x30c040) to magenta, blue (0x3060ff) to yellow, yellow (0xffd030) to dark blue, magenta (0xff30c0) to green, cyan (0x30d0d0) to warm red. Originally bright cells appear darker; originally dark cells appear lighter. No gaps between cells.',
);

// Canvas parity column for the same full-frame invert grade as render.webgl.ts: fully inverts every channel,
// realized through Canvas 2D compositing.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [createInvertAdjustment({ intensity: 1 })]);
}

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// fully inverts every channel.

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
  const col = 3 % cols;
  const row = Math.floor(3 / cols);
  const cx = Math.round(((col + 0.5) * frame.width) / cols);
  const cy = Math.round(((row + 0.5) * frame.height) / rows);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;

  if (lum >= 170) {
    throw new Error(
      `[effect-invert] yellow cell luminance is ${lum.toFixed(1)} (expected < 170 after inversion, original ~204)`,
    );
  }
}
