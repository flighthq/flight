import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createLiftGammaGainAdjustment,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
  getBitmapPixelRgb,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the same full-frame liftGammaGain grade as render.webgl.ts: applies a warm lift and cool gain for a cinematic split-tone.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createLiftGammaGainAdjustment({ lift: 0x8a7860ff, gamma: 0x808080ff, gain: 0x7088a0ff }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// applies a warm lift and cool gain for a cinematic split-tone.

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
// The grade's whole job is to move the frame's color balance, so the frame's mean channels are the direct
// evidence. The cool gain pulls blue DOWN off its ungraded ceiling: measured with the grade applied vs the
// same scene with the pipeline bypassed, mean blue is 160.0 vs 255.0 while red barely moves (124.5 vs
// 133.4). The band below sits between those two arms. The fingerprint cannot arbitrate this: its committed
// grid scores 4.60 against a uniform frame of its own background, under the gate's threshold of 5.
export function assertRender(frame: Readonly<Bitmap>): void {
  const meanBlue = measureMeanBlue(frame);
  if (meanBlue > 200) {
    throw new Error(
      `[effect-lift-gamma-gain] mean blue is ${meanBlue.toFixed(1)} (expected <= 200) — the frame still sits ` +
        `at its ungraded ceiling, so the grade did not reach it`,
    );
  }
  if (meanBlue < 120) {
    throw new Error(
      `[effect-lift-gamma-gain] mean blue is ${meanBlue.toFixed(1)} (expected >= 120) — the cool gain crushed ` +
        `the channel rather than grading it`,
    );
  }
}

function measureMeanBlue(frame: Readonly<Bitmap>): number {
  let blue = 0;
  let samples = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      blue += getBitmapPixelRgb(frame, x, y) & 255;
      samples += 1;
    }
  }
  return samples === 0 ? 0 : blue / samples;
}
