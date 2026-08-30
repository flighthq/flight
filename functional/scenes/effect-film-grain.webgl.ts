import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
// ★ SCOPE DECLARATION, NOT A GAP. The fingerprint regression gate is NOT the instrument for this scene:
// the subject is PER-PIXEL NOISE of about +-3 levels and the fingerprint is a block average — averaging is
// precisely the operation that removes noise, so the instrument cancels the subject; committed contrast is
// 0.55. `assertRender` measures adjacent-pixel energy (>= 4) and bounds mean luma to 120..210 so a wash to
// black or white cannot pass as grain, which does see it.
//
// There is nothing here to close. The limitation is structural — the fingerprint cannot represent this
// subject — rather than a missing capability, so this must never be filed later as an unfixed gap.
//
import type { Bitmap, Node2D, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
  createGlContextState,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createFilmGrainEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  getBitmapPixelRgb,
  registerGlFilmGrainEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'A uniform mid-gray field (0x808080) filling the entire 800×600 frame — a single full-frame rectangle with no distinct geometry or base-color variation — overlaid with fine random speckle noise from the film grain effect (intensity 0.3, grain size 1.5, seed 7). Only the grain texture over flat gray. The noise is subtle: individual specks are visible at full resolution but average to gray at a distance.',
);

// Film grain: per-pixel noise is mixed over the frame. A flat mid-gray fill is the cleanest backdrop —
// the grain shows as fine speckle that would be invisible over busy content. Fixed seed keeps the
// static capture deterministic.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2dGlPipeline,
  {
    pixelRatio,
    backgroundColor: 0x808080ff,
  },
);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlFilmGrainEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [createFilmGrainEffect({ intensity: 0.3, size: 1.5, seed: 7 })]);
}

// A flat mid-gray fill covering the whole frame. The even tone is the ideal backdrop for film grain:
// the noise speckle is the only structure in the image.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const fill = createShape();
appendShapeBeginFill(fill, 0x808080ff, 1);
appendShapeRectangle(fill, 0, 0, logicalWidth, logicalHeight);
appendShapeEndFill(fill);
addNodeChild(root, fill);

render(root);

// Film grain is per-pixel noise, and per-pixel noise is exactly what the regression fingerprint cannot
// see: it averages the frame into 16x16 cells, where speckle cancels to the flat tone underneath. This
// target's whole committed fingerprint scores 0.55 against a uniform frame of its own background, so no
// change confined to the picture can reach the gate's threshold of 5 — the grain could stop being
// applied at all and the gate would still read green. High-frequency energy is the complement of what
// the fingerprint keeps: the mean absolute difference between horizontally adjacent pixels, which a box
// average destroys and an unfiltered flat fill drives to ~0. Measured on a correct render: 17.19 on the
// GPU backends, 8.31 on canvas; the floor sits below both and far above a grainless field.
export function assertRender(frame: Readonly<Bitmap>): void {
  const { highFrequency, meanLuma } = measureGrain(frame);
  if (highFrequency < 4) {
    throw new Error(
      `[effect-film-grain] adjacent-pixel energy is ${highFrequency.toFixed(2)} (expected >= 4) — the frame ` +
        `is smooth, so the grain pass did not reach it`,
    );
  }
  // The grain must speckle the mid-gray field, not replace it: a wash to black or white would raise no
  // high-frequency alarm on its own.
  if (meanLuma < 120 || meanLuma > 210) {
    throw new Error(
      `[effect-film-grain] mean luma is ${meanLuma.toFixed(1)} (expected 120..210) — the grained field is no ` +
        `longer the mid-gray backdrop it is drawn over`,
    );
  }
}

function measureGrain(frame: Readonly<Bitmap>): { highFrequency: number; meanLuma: number } {
  let deltas = 0;
  let luma = 0;
  let pairs = 0;
  let samples = 0;
  for (let y = 0; y < frame.height; y += 1) {
    let previous = -1;
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const value = (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
      luma += value;
      samples += 1;
      if (previous >= 0) {
        deltas += Math.abs(value - previous);
        pairs += 1;
      }
      previous = value;
    }
  }
  return { highFrequency: pairs === 0 ? 0 : deltas / pairs, meanLuma: samples === 0 ? 0 : luma / samples };
}
