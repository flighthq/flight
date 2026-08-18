import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  getBitmapPixelRgb,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createPosterizeEffect,
  createShape,
  registerGlPosterizeEffect,
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
  'The 800×600 field is exactly filled by a gapless 3×2 grid of six flat colour panels, each one ' +
    'third of the width and one half of the height. From left to right they remain recognisably red, ' +
    'green and blue on the top row, then yellow, magenta and cyan on the bottom, but every channel is ' +
    'snapped to one of four intensity steps: across the six panel centres there are no more than four ' +
    'distinct blue values, rather than the five values in the ungraded colours. There is no visible ' +
    'background, border, gradient, outline or spacing between panels.',
);

// Full-frame posterize color grade: quantizes each channel to 4 levels. One config applied to the whole scene through an
// rgba8 effect pipeline (the default format for color ops, so format is omitted).
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x202830ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlPosterizeEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createPosterizeEffect({ levels: 4 })]);
}

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

// Posterize quantizes each channel to 4 levels. The 6 input cells have 5 unique blue channel values
// (48, 64, 255, 192, 208). After quantization to 4 levels, at most 4 unique B values remain —
// verified in both sRGB and linear quantization paths. Without the effect, the original 5 unique B
// values exceed the threshold.
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
