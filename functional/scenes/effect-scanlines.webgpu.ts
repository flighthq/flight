import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createScanlinesEffect,
  createShape,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  registerWgpuScanlinesEffect,
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

// Wgpu parity column for the same scanlines intent as render.webgl.ts. Wgpu render-state init is
// async; the full-frame effect pipeline runs between renderWgpuBackground and submitWgpuRenderPass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuScanlinesEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [createScanlinesEffect({ count: 240, intensity: 0.5 })]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, giving
// the scanlines effect dense high-frequency content (edges, quantizable color, sample neighborhoods)
// to act on.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff, 0xd25cffff, 0x5cf0ffff];
for (let i = 0; i < 18; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i % colors.length], 1);
  appendShapeRectangle(shape, -28, -10, 56, 20);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.12 + 0.18 * (i % 5));
  shape.y = logicalHeight * (0.18 + 0.2 * Math.floor(i / 5));
  shape.rotation = i * 22;
  addNodeChild(root, shape);
}

render(root);

// Scanlines (count 240, intensity 0.5) overlay alternating dark horizontal bands on the frame.
// Every ~2.5 rows (600/240), the brightness alternates, creating high vertical-frequency content.
// Measuring vertical adjacent-pixel energy captures this periodic pattern. Without the effect,
// vertical HF stays near the base scene level (~1-2); with scanlines it exceeds 3.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureVerticalHighFrequency(frame);
  if (hf < 3) {
    throw new Error(
      `[effect-scanlines] vertical high-frequency energy is ${hf.toFixed(2)} (expected >= 3) — ` +
        `scanline bands not visible`,
    );
  }
}

function measureVerticalHighFrequency(frame: Readonly<Bitmap>): number {
  let deltas = 0;
  let pairs = 0;
  for (let x = 0; x < frame.width; x += 2) {
    let previous = -1;
    for (let y = 0; y < frame.height; y += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const value = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (previous >= 0) {
        deltas += Math.abs(value - previous);
        pairs += 1;
      }
      previous = value;
    }
  }
  return pairs === 0 ? 0 : deltas / pairs;
}
