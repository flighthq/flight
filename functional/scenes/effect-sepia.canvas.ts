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
  createSepiaAdjustment,
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

// Canvas parity column for the same full-frame sepia grade as render.webgl.ts: applies a full sepia tone,
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
  endCanvasRenderEffectPipeline(state, pipeline, [createSepiaAdjustment({ intensity: 1 })]);
}

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// applies a full sepia tone.

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
// Sepia maps every color to a warm brown scale whose channel ordering is R >= G >= B. The sepia
// matrix's row coefficients are R-row > G-row > B-row in every column, so this ordering holds
// regardless of whether the operation runs in sRGB or linear space. Without the effect, cell 1
// (0x30c040ff, G=192 >> R=48) and cell 2 (0x3060ffff, B=255 >> R=48) violate R >= G >= B and fail.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const labels = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(((col + 0.5) * frame.width) / cols);
    const cy = Math.round(((row + 0.5) * frame.height) / rows);
    const rgb = getBitmapPixelRgb(frame, cx, cy);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;

    if (r < g - 3 || g < b - 3) {
      throw new Error(
        `[effect-sepia] ${labels[i]} cell has rgb(${r},${g},${b}) — expected warm-tone ordering R >= G >= B`,
      );
    }
  }
}
