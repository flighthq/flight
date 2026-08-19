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
  createLensFlareEffect,
  createShape,
  getBitmapPixelRgb,
  registerGlLensFlareEffect,
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
  'Four bright rotated rectangles (white 0xffffff, yellow 0xfff05c, cyan 0x5cffe0, magenta 0xff5ce0) of 140×140 each in a 2×2 arrangement on near-black (0x05060a), rotated 12°/32°/52°/72°. Semi-transparent ghost images mirrored through the frame center and a displaced halo arc from the HDR lens flare (threshold 0.7, 5 ghosts, halo 0.4, rgba16f pipeline). Bright shapes above the threshold seed the flare artifacts. A frame with only the four rectangles and no ghost/halo artifacts between them is a failure.',
);

// Lens flare [HDR]: bright shapes above the threshold seed ghosts and a halo mirrored through the
// frame center, run through an HDR (rgba16f) pipeline so bright spots carry the flare.
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
registerGlLensFlareEffect(state);

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
  endGlRenderEffectPipeline(state, pipeline, [
    createLensFlareEffect({ threshold: 0.7, intensity: 1.6, ghosts: 5, halo: 0.4 }),
  ]);
}

// Bright, saturated shapes on a near-black field — high luminance to seed lens-flare ghosts and halo.

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
  shape.rotation = 12 + i * 20;
  addNodeChild(root, shape);
}

render(root);

// ★ READ OFF THE SOURCE: a lens flare at threshold 0.7 with 5 ghosts and halo 0.4, over four bright
// tiles. The recipe walks ghost samples along the vector toward the frame centre, so its whole
// signature is light appearing in the gap BETWEEN the tiles — and the description names that as its own
// failure: "a frame with only the four rectangles and no ghost/halo artifacts between them".
//
// So the check reads the centre of the frame, which no tile reaches. Measured against a control with
// the flare's intensity set to 0:
//
//     flare running   centre mean 18.13, max 56
//     flare at 0      centre mean  7.00, max  7    the background, exactly
//
// Both a mean and a max, because they fail differently: a uniform lift of the whole field would raise
// the mean without producing a ghost, and the max is what shows discrete structure.
//
// ★ ONE OBSERVATION THIS DOES NOT ASSERT, recorded rather than dropped: the far corner of the frame,
// which no tile and no description clause covers, reads mean 192.7 with the flare on and 7.0 with it
// off. That is a very strong artifact in a region the description never mentions, and whether it is
// correct for this recipe is not something the scene's own text settles. Asserting it either way would
// bless or condemn a picture nobody has ruled on.
const MIN_CENTRE_MEAN = 12;
const MIN_CENTRE_MAX = 25;
const CENTRE_HALF = 60;

export function assertRender(frame: Readonly<Bitmap>): void {
  const luminance = (x: number, y: number): number => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
  };

  const midX = Math.round(frame.width / 2);
  const midY = Math.round(frame.height / 2);
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (let y = midY - CENTRE_HALF; y < midY + CENTRE_HALF; y++) {
    for (let x = midX - CENTRE_HALF; x < midX + CENTRE_HALF; x++) {
      const value = luminance(x, y);
      sum += value;
      count++;
      if (value > peak) peak = value;
    }
  }
  const mean = sum / Math.max(1, count);

  if (mean < MIN_CENTRE_MEAN) {
    throw new Error(
      `[effect-lens-flare] the centre of the frame reads ${mean.toFixed(2)} (expected at least ` +
        `${MIN_CENTRE_MEAN}) — no ghost or halo light between the tiles, which is this scene's own ` +
        `stated failure`,
    );
  }
  if (peak < MIN_CENTRE_MAX) {
    throw new Error(
      `[effect-lens-flare] the brightest pixel between the tiles is ${peak.toFixed(0)} (expected at ` +
        `least ${MIN_CENTRE_MAX}) — the centre is lifted uniformly rather than carrying a ghost`,
    );
  }
}
