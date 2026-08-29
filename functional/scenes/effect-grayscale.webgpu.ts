import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createGrayscaleAdjustment,
  createShape,
  createWgpuCanvasElement,
  getBitmapPixelRgb,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'Six shades of neutral gray in a 3×2 grid filling the 800×600 frame (cells ~267×300 px; columns at x 0/267/533, rows at y 0/300). Top row left to right: dark gray (from red 0xff3030), medium gray (from green 0x30c040), medium-dark gray (from blue 0x3060ff); bottom row: light gray (from yellow 0xffd030), medium gray (from magenta 0xff30c0), medium gray (from cyan 0x30d0d0). Each cell is a single flat tone with no color — all saturation removed. No gaps between cells.',
);

// Wgpu parity column for the same full-frame grayscale grade as render.webgl.ts: fully desaturates the frame to luminance.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createGrayscaleAdjustment({ intensity: 1 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

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
