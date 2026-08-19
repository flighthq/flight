import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
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
  getBitmapPixelRgb,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'Four narrow colored bars (pink 0xff5c7c, green 0x5cff9c, blue 0x5c9cff, gold 0xffd25c) of 180×32 on dark background (0x101014), rotated 18°/42°/66°/90°. Diagonal edges are smooth from 4× multisampling. No post-process effects applied — empty effects array.',
);

// MSAA reference: the scene renders through the opt-in effect pipeline with sampleCount 4 — an
// offscreen multisampled target that resolves to the canvas. With no effect stages, this isolates
// MSAA alone, so the rotated shape's edges should be smooth (the jaggies that started this work).
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

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// Rotated, slightly-skewed filled shapes whose long diagonal edges alias badly without MSAA. Rendered
// through the effect pipeline at sampleCount 4, the edges should come out smooth.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -90, -16, 180, 32);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.25 + 0.5 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.25 * Math.floor(i / 2));
  shape.rotation = 18 + i * 24;
  addNodeChild(root, shape);
}

render(root);

// ★ READ OFF THE SOURCE, NOT OFF THE PICTURE: this scene builds its effect pipeline with
// `sampleCount: 4` and draws four filled bars rotated off-axis on a flat field, with an empty effects
// array. A multisampled resolve is the only thing in that description that can put a pixel at PARTIAL
// coverage — a fraction of a bar's colour blended with the field — so counting partial-luminance pixels
// along the diagonal edges measures exactly the one property the scene exists to show.
//
// The window sits between the two luminances the scene actually contains: the field is 0x101014
// (luminance about 17) and the dimmest bar channel average is well above 90, so nothing but an edge
// pixel can land inside it.
const PARTIAL_LOW = 20;
const PARTIAL_HIGH = 90;

function countPartialCoveragePixels(frame: Readonly<Bitmap>): number {
  let partial = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const luminance = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      if (luminance > PARTIAL_LOW && luminance < PARTIAL_HIGH) partial++;
    }
  }
  return partial;
}

// Measured on this scene: 258 partial pixels with the resolve working, against 0 on a backend that
// silently drops to a single sample. The threshold sits far from both.
const MIN_ANTIALIASED_EDGE_PIXELS = 80;

export function assertRender(frame: Readonly<Bitmap>): void {
  const partial = countPartialCoveragePixels(frame);
  if (partial < MIN_ANTIALIASED_EDGE_PIXELS) {
    throw new Error(
      `[effect-msaa] only ${partial} partial-coverage pixels (expected at least ` +
        `${MIN_ANTIALIASED_EDGE_PIXELS}) — the bars' diagonal edges are hard, so the pipeline's ` +
        `sampleCount 4 did not resolve; this cell exists to show that it does`,
    );
  }
}
