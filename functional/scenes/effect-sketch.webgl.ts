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
  createShape,
  createSketchEffect,
  defaultGlShapeRenderer,
  registerGlSketchEffect,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  getBitmapPixelRgb,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800×600 near-black field carries the stroke-like remains of 18 narrow rectangles in four ' +
    'staggered rows, with five columns in the first three rows and three in the last. The rectangles ' +
    'began as six repeating saturated colours and successive 22-degree rotations, but the visible ' +
    'result is entirely monochrome: edges and interior detail read as varied grey pencil marks, with ' +
    'no surviving red, green, blue, yellow, violet or cyan. The result is not a flat grey wash — ' +
    'adjacent light and dark stroke structure remains — and the separate shapes do not merge into one ' +
    'solid block.',
);

// sketch: a full-frame stylization pass applied to the whole scene through a default rgba8 pipeline.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlSketchEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createSketchEffect({ strength: 1 })]);
}

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, giving
// the sketch effect dense high-frequency content (edges, quantizable color, sample neighborhoods)
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

// The sketch pass renders the scene as pencil strokes, and its sharpest signature is that the result is
// MONOCHROME: the six saturated fills collapse to gray. Measured with the effect applied vs the same
// scene with the pipeline bypassed — mean chroma 0.000 vs 8.750, adjacent-pixel energy 1.75 vs 0.66. Both
// are invisible to the regression fingerprint, whose committed grid scores 3.86 against a uniform frame
// of its own background, under the gate's threshold of 5. Chroma is the load-bearing check; the energy
// floor is the second arm, so a frame that is gray for the wrong reason (a flat wash) still fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const { highFrequency, saturation } = measureSketch(frame);
  if (saturation > 2) {
    throw new Error(
      `[effect-sketch] mean chroma is ${saturation.toFixed(2)} (expected <= 2) — the fills kept their color, ` +
        `so the sketch pass did not reach the frame`,
    );
  }
  if (highFrequency < 1.2) {
    throw new Error(
      `[effect-sketch] adjacent-pixel energy is ${highFrequency.toFixed(2)} (expected >= 1.2) — the frame is ` +
        `gray but carries no stroke structure`,
    );
  }
}

function measureSketch(frame: Readonly<Bitmap>): { highFrequency: number; saturation: number } {
  let deltas = 0;
  let pairs = 0;
  let chroma = 0;
  let samples = 0;
  for (let y = 0; y < frame.height; y += 1) {
    let previous = -1;
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const r = (rgb >> 16) & 255;
      const g = (rgb >> 8) & 255;
      const b = rgb & 255;
      const value = (r + g + b) / 3;
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
      samples += 1;
      if (previous >= 0) {
        deltas += Math.abs(value - previous);
        pairs += 1;
      }
      previous = value;
    }
  }
  return { highFrequency: pairs === 0 ? 0 : deltas / pairs, saturation: samples === 0 ? 0 : chroma / samples };
}
