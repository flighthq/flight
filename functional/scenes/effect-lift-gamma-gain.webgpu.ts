import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
// ★ SCOPE DECLARATION, NOT A GAP. The fingerprint regression gate is NOT the instrument for this scene:
// the subject is a GLOBAL TONAL SHIFT over a flat field. That is the one class `npm run contrast` states it
// does not bound, and `npm run displacement` cannot see it either — moving a flat field changes nothing;
// committed contrast is 4.60 and the one-cell displacement score is 0.82. `assertRender` bounds mean blue to
// 120..200, which does see a grade that did not run or that crushed the channel.
//
// There is nothing here to close. The limitation is structural — the fingerprint cannot represent this
// subject — rather than a missing capability, so this must never be filed later as an unfixed gap.
//
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
  createWgpuRenderStateFromCanvasElement,
  scene2dWgpuPipeline,
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
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'Six rectangles in a 3×2 grid filling the 800×600 frame (cells ~267×300 px; columns at x 0/267/533, rows at y 0/300; source colors red 0xff3030, green 0x30c040, blue 0x3060ff, yellow 0xffd030, magenta 0xff30c0, cyan 0x30d0d0) with a warm-shadow / cool-highlight split-tone grade applied. Shadows are pushed warm (amber tint from lift 0x8a7860) while highlights are pushed cool (blue-gray tint from gain 0x7088a0). Blues are notably suppressed. No gaps between cells.',
);

// Wgpu parity column for the same full-frame liftGammaGain grade as render.webgl.ts: applies a warm lift and cool gain for a cinematic split-tone.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, scene2dWgpuPipeline, {
  pixelRatio,
  backgroundColor: 0x202830ff,
});
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

// The grade's whole job is to move the frame's color balance. The cool gain pulls blue DOWN off its
// ungraded ceiling: measured with the grade applied vs the same scene with the pipeline bypassed, mean blue
// is 160.0 vs 255.0 while red barely moves (124.5 vs 133.4). The band below sits between those two arms.
//
// A mean alone is permutation-blind, so each flat cell also carries its measured graded RGB at its own
// location. Both GPU backends produce the six values below exactly; a four-level channel tolerance leaves
// headroom for raster conversion while remaining below the nearest two cells' ten-level separation. The
// fingerprint cannot arbitrate this: its committed grid scores 4.60 against a uniform frame of its own
// background, under the gate's threshold of 5. MEASURED defeat: swapping the first two source cells left
// the old mean unchanged but failed here at cell 0 (#858471 vs #707b6d) on both GPU backends.
export function assertRender(frame: Readonly<Bitmap>): void {
  assertCellColors(frame);

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

const EXPECTED_CELL_RGB = [0x707b6d, 0x858471, 0x857fa0, 0x70856d, 0x707b91, 0x858595] as const;
const MAX_CELL_CHANNEL_DELTA = 4;

function assertCellColors(frame: Readonly<Bitmap>): void {
  for (let i = 0; i < EXPECTED_CELL_RGB.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = Math.floor(((col + 0.5) * frame.width) / cols);
    const y = Math.floor(((row + 0.5) * frame.height) / rows);
    const actual = getBitmapPixelRgb(frame, x, y);
    const expected = EXPECTED_CELL_RGB[i];
    const delta = Math.max(
      Math.abs(((actual >> 16) & 255) - ((expected >> 16) & 255)),
      Math.abs(((actual >> 8) & 255) - ((expected >> 8) & 255)),
      Math.abs((actual & 255) - (expected & 255)),
    );
    if (delta > MAX_CELL_CHANNEL_DELTA) {
      throw new Error(
        `[effect-lift-gamma-gain] cell ${i} at (${x}, ${y}) is #${actual.toString(16).padStart(6, '0')} ` +
          `(expected #${expected.toString(16).padStart(6, '0')} within ${MAX_CELL_CHANNEL_DELTA} per channel) — ` +
          `the graded colors moved to the wrong cells or the grade changed`,
      );
    }
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
