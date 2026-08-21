import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  getBitmapPixelRgb,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWhiteBalanceEffect,
  defaultWgpuShapeRenderer,
  registerWgpuWhiteBalanceEffect,
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
  'The 800×600 field is exactly filled by a gapless 3×2 grid of six flat colour panels, each one ' +
    'third of the width and one half of the height. From left to right they remain recognisably red, ' +
    'green and blue on the top row, then yellow, magenta and cyan on the bottom, but the whole set is ' +
    "warmed and shifted toward magenta. In particular the blue panel's red channel is visibly lifted " +
    'above its authored value of 48 while blue is attenuated; it is not the untouched cool blue. ' +
    'There is no background, border, gradient, outline or spacing between panels.',
);

// Wgpu parity column for the same full-frame whiteBalance grade as render.webgl.ts: warms the temperature and shifts tint toward magenta.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuWhiteBalanceEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createWhiteBalanceEffect({ temperature: 0.4, tint: -0.2 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// warms the temperature and shifts tint toward magenta.

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

// Warm white balance (temperature 0.4) boosts the red channel and attenuates blue. Cell 2
// (blue, 0x3060ffff, R=48) should have its red channel lifted above 60. Without the effect,
// R=48 < 60 and the assertion fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const cx = Math.round(((2 + 0.5) * frame.width) / cols);
  const cy = Math.round(((0 + 0.5) * frame.height) / rows);
  const rgb = getBitmapPixelRgb(frame, cx, cy);
  const r = (rgb >> 16) & 0xff;

  if (r <= 60) {
    throw new Error(`[effect-white-balance] blue cell R=${r} after warm temperature — expected R > 60`);
  }
}
