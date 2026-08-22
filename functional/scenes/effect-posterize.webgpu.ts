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
  createPosterizeEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  enableWgpuRenderEffectGuards,
  registerWgpuPosterizeEffect,
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
  'The 800×600 field is exactly filled by a gapless 3×2 grid of six flat colour panels, each one ' +
    'third of the width and one half of the height. From left to right they remain recognisably red, ' +
    'green and blue on the top row, then yellow, magenta and cyan on the bottom, but every channel is ' +
    'snapped to one of four intensity steps: across the six panel centres there are no more than four ' +
    'distinct blue values, rather than the five values in the ungraded colours. There is no visible ' +
    'background, border, gradient, outline or spacing between panels.',
);

// Wgpu parity column for the same full-frame posterize grade as render.webgl.ts: quantizes each channel to 4 levels.
// Wgpu render-state init is async (createWgpuRenderState returns a Promise). The effect pipeline
// runs between renderWgpuBackground (opens the encoder + canvas pass) and submitWgpuRenderPass
// (flushes it), grading the rgba8 scene target.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x202830ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuPosterizeEffect(state);
enableWgpuRenderEffectGuards(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createPosterizeEffect({ levels: 4 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Distinct saturated-color shapes filling the frame, suited to showing a full-frame color grade:
// quantizes each channel to 4 levels.

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

const EXPECTED_CELL_RGB = [0xff0000, 0x00ff55, 0x0055ff, 0xffff00, 0xff00ff, 0x00ffff] as const;

// Posterize quantizes each channel to 4 levels. The 6 input cells have 5 unique blue channel values
// (48, 64, 255, 192, 208). After quantization to 4 levels, at most 4 unique B values remain —
// verified in both sRGB and linear quantization paths. Without the effect, the original 5 unique B
// values exceed the threshold. Location-indexed centers independently prove that the six quantized
// colors still occupy the intended cells; permuting whole panels leaves the aggregate blue set unchanged.
// MEASURED defeat: swapping cells 0 and 1 failed at (133, 150), #00ff55 versus expected #ff0000.
export function assertRender(frame: Readonly<Bitmap>): void {
  const cols = 3;
  const rows = 2;
  const blues = new Set<number>();

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(((col + 0.5) * frame.width) / cols);
    const cy = Math.round(((row + 0.5) * frame.height) / rows);
    const rgb = getBitmapPixelRgb(frame, cx, cy);
    const expected = EXPECTED_CELL_RGB[i]!;
    const channelDelta = Math.max(
      Math.abs(((rgb >> 16) & 255) - ((expected >> 16) & 255)),
      Math.abs(((rgb >> 8) & 255) - ((expected >> 8) & 255)),
      Math.abs((rgb & 255) - (expected & 255)),
    );
    if (channelDelta > 4) {
      throw new Error(
        `[effect-posterize] cell ${i} center at (${cx}, ${cy}) is #${rgb.toString(16).padStart(6, '0')} ` +
          `(expected #${expected.toString(16).padStart(6, '0')}) — the quantized panels moved or changed`,
      );
    }
    const b = rgb & 0xff;
    let found = false;
    for (const existing of blues) {
      if (Math.abs(existing - b) < 8) {
        found = true;
        break;
      }
    }
    if (!found) blues.add(b);
  }

  if (blues.size > 4) {
    throw new Error(
      `[effect-posterize] expected <= 4 distinct blue levels after quantization, got ${blues.size} — ` +
        `values: ${[...blues].join(', ')}`,
    );
  }
}
