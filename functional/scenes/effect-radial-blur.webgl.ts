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
  createRadialBlurEffect,
  createShape,
  registerGlRadialBlurEffect,
  defaultGlShapeRenderer,
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
  'On an 800×600 near-black field (about R5 G6 B10), four 110×110 rotated squares form a loose ' +
    'zig-zag across the middle: white at (160,240), yellow at (320,312), cyan at (480,240) and ' +
    'magenta at (640,312), turned by 10, 28, 46 and 64 degrees. Their colour and edges smear radially ' +
    'away from the field centre at (400,300), producing soft zoom-like streaks and no crisp square ' +
    'boundary. The four sources remain individually readable rather than blending into one central ' +
    'cloud, and the outer corners stay near-black instead of being filled by colour.',
);

// Radial blur: the full frame smears radially outward from the configured center, so mid-screen
// shapes streak toward the edges like a zoom blur.
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
registerGlRadialBlurEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createRadialBlurEffect({ centerX: 0.5, centerY: 0.5, strength: 0.4, samples: 12 }),
  ]);
}

// A few mid-screen shapes spaced along the horizontal axis with gaps between them, so a full-frame
// directional/radial/camera smear leaves clearly readable streaks rather than overlapping mush.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -55, -55, 110, 110);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.2 + 0.2 * i);
  shape.y = logicalHeight * (0.4 + 0.12 * (i % 2));
  shape.rotation = 10 + i * 18;
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

// Radial blur (strength 0.4) smears the frame radially from center, softening all edges. The
// unprocessed scene with 4 rotated shapes has HF energy ~3-4. After radial blur, HF drops below
// 1.5. Without the effect, sharp edges keep HF above 1.5 and the check fails.
export function assertRender(frame: Readonly<Bitmap>): void {
  const hf = measureHighFrequency(frame);
  if (hf >= 1.5) {
    throw new Error(
      `[effect-radial-blur] high-frequency energy is ${hf.toFixed(2)} (expected < 1.5) — ` +
        `radial blur should smooth edges`,
    );
  }
}
