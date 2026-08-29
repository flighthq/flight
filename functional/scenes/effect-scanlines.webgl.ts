import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createScanlinesEffect,
  createShape,
  registerGlScanlinesEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'An 800×600 near-black blue-grey field (about R16 G16 B20) carries 18 narrow saturated rectangles ' +
    'in four staggered rows. Each is 56×20 before rotation; the repeated colours are red-pink, green, ' +
    'blue, yellow, violet and cyan, and successive rectangles turn by 22 degrees. Alternating dark ' +
    'horizontal bands cross the entire field and every rectangle at a spacing of about 2.5 px (600 px ' +
    'divided by 240 bands), making brightness vary strongly between adjacent rows. The bands do not ' +
    'become vertical, stop at shape edges or erase the near-black gaps between the separate ' +
    'rectangles.',
);

// scanlines: a full-frame stylization pass applied to the whole scene through a default rgba8 pipeline.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  }),
  {
    pixelRatio,
    backgroundColor: 0x101014ff,
  },
);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlScanlinesEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createScanlinesEffect({ count: 240, intensity: 0.5 })]);
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
