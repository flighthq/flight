import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createInvertAdjustment,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same full-frame invert grade as render.webgl.ts: fully inverts every channel.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);

// WebGPU effect targets are single-sample and the pipeline rejects multisample requests rather than
// discarding that axis. Its WebGL companion independently requests the backend's supported 4x target.
const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createInvertAdjustment({ intensity: 1 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

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
