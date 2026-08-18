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
  createTiltShiftEffect,
  defaultGlShapeRenderer,
  registerGlTiltShiftEffect,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R5 G6 B10), four 160×160 squares sit near the corners: ' +
    'white centred at (128,108), yellow at (672,120), cyan at (144,492) and magenta at (656,480), ' +
    'turned by 8, 22, 36 and 50 degrees. The top and bottom out-of-focus bands soften those four ' +
    'off-centre silhouettes, while the horizontal focus band through the middle stays free of ' +
    'spurious blur. The shapes remain separately coloured rather than merging into a wash, and the ' +
    'extreme corners remain near-black.',
);

// Tilt shift: a horizontal focus band across the vertical center stays sharp while shapes above
// and below the band blur, mimicking a miniature-faking shift lens.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlTiltShiftEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createTiltShiftEffect({ center: 0.5, width: 0.25, blur: 6 })]);
}

// Off-center shapes pushed toward the frame edges, so lens curvature and out-of-focus falloff away
// from the center are clearly visible against the straight rectangle edges.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
const positions = [
  [0.16, 0.18],
  [0.84, 0.2],
  [0.18, 0.82],
  [0.82, 0.8],
];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -80, -80, 160, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * positions[i][0];
  shape.y = logicalHeight * positions[i][1];
  shape.rotation = 8 + i * 14;
  addNodeChild(root, shape);
}

render(root);

function measureHighFrequency(frame: Readonly<Bitmap>): number {
  let deltas = 0;
  let pairs = 0;
  for (let y = 0; y < frame.height; y += 1) {
    let previous = -1;
    for (let x = 0; x < frame.width; x += 1) {
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

// Tilt-shift (blur 6, width 0.25) selectively blurs the top and bottom of the frame while keeping
// the center strip sharp. The blurred regions lose their sharp edges, reducing overall HF energy.
// The unprocessed scene has HF ~3-4; after tilt-shift it drops below 2.5. Without the effect,
// all edges remain sharp and HF stays above 2.5.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureHighFrequency(frame);
  if (hf >= 2.5) {
    throw new Error(
      `[effect-tilt-shift] high-frequency energy is ${hf.toFixed(2)} (expected < 2.5) — ` +
        `tilt-shift blur should smooth edges in the out-of-focus bands`,
    );
  }
}
