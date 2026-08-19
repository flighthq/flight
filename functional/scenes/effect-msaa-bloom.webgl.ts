import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createBloomEffect,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  getBitmapPixelRgb,
  registerGlBloomEffect,
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
  'Four bright rotated rectangles (white 0xffffff, yellow 0xfff05c, cyan 0x5cffe0, magenta 0xff5ce0) of 140×140 each in a 2×2 arrangement on near-black (0x05060a), rotated 27°/44°/61°/78°. Smooth antialiased edges from 4× MSAA and soft glowing halos bleeding outward from the bloom effect (threshold 0.6, intensity 1.4, rgba16f pipeline).',
);

// MSAA + bloom together: the pipeline uses a multisampled HDR (rgba16f) target with sampleCount 4 and
// also runs a bloom scene2d. This proves the MSAA-resolve and the effect-compose paths cooperate — the
// rotated shapes' edges resolve smooth while their bright interiors still bloom a soft halo.
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
registerGlBloomEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createBloomEffect({ threshold: 0.6, intensity: 1.4 })]);
}

// Bright rotated shapes on a near-black field: their steep diagonal edges expose jaggies that MSAA
// should resolve smooth, while their high luminance crosses the bloom threshold for a glowing halo —
// so the scene exercises MSAA resolve and effect compose at once.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  shape.rotation = 27 + i * 17;
  addNodeChild(root, shape);
}

render(root);

// ★ READ OFF THE SOURCE: bright rotated tiles on a near-black field with a bloom at threshold 0.6,
// intensity 1.4, through a pipeline built at sampleCount 4. The check counts the GRADIENT POPULATION —
// pixels that are neither background nor tile core — because a bloom's whole signature is a wide band
// of them. Measured here: 20558 on canvas, 23116 on Gl, 22883 on Wgpu against 78-82k lit pixels. The
// same frame with the bloom's intensity set to 0 collapses to about 1100, the antialiased rim alone.
//
// ★ WHAT THIS CELL CANNOT ESTABLISH, stated rather than left implied: the description also makes an
// ANTIALIASING claim, and this scene cannot separate it. The bloom's own gradient occupies exactly the
// intermediate-luminance band that a multisample resolve would show up in, so any measurement of one
// is contaminated by the other. `effect-msaa` tests that claim in isolation — same tiles, no bloom —
// and does distinguish the backends (258 partial-coverage pixels on Gl against 0 on Wgpu).
//
// The hue claim is likewise left to `effect-bloom`: its tiles are rotated less, so a point outside the
// silhouette still sits in coloured halo, whereas here the tile corners reach that far.
const MID_BAND_LOW = 15;
const MID_BAND_HIGH = 120;
const MIN_GRADIENT_RATIO = 0.1;
const MAX_FIELD_CENTRE_LUMINANCE = 15;

export function assertRender(frame: Readonly<Bitmap>): void {
  const luminance = (x: number, y: number): number => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
  };

  let gradient = 0;
  let lit = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const value = luminance(x, y);
      if (value > MID_BAND_LOW && value < MID_BAND_HIGH) gradient++;
      else if (value >= MID_BAND_HIGH) lit++;
    }
  }

  const ratio = gradient / Math.max(1, lit);
  if (ratio < MIN_GRADIENT_RATIO) {
    throw new Error(
      `[effect-msaa-bloom] the gradient population is ${ratio.toFixed(3)} of the lit population ` +
        `(expected at least ${MIN_GRADIENT_RATIO}) — the tiles have crisp edges with no halo, so the ` +
        `bloom did not run`,
    );
  }

  const centre = luminance(Math.round(frame.width * 0.5), Math.round(frame.height * 0.5));
  if (centre > MAX_FIELD_CENTRE_LUMINANCE) {
    throw new Error(
      `[effect-msaa-bloom] the middle of the field reads ${centre.toFixed(1)} (expected at most ` +
        `${MAX_FIELD_CENTRE_LUMINANCE}) — the glow is filling the picture instead of staying near the tiles`,
    );
  }
}
