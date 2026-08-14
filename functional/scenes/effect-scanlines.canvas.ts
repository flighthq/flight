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
  createScanlinesEffect,
  createShape,
  registerCanvasScanlinesEffect,
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

// Canvas parity column for the same scanlines intent as render.webgl.ts.
// Scanlines (REAL on Canvas): the scene is drawn, then a set of darkening horizontal lines is
// overlaid at `intensity` — the same RenderEffect intent realized with Canvas 2D draw ops.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasScanlinesEffect(state);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [createScanlinesEffect({ count: 240, intensity: 0.5 })]);
}

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

// ORACLE-BLOCK
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
