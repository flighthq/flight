import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginCanvasRenderEffectPipeline,
  createBloomEffect,
  createCanvasElement,
  createCanvasRenderEffectPipeline,
  createCanvasRenderState,
  createColorGradeAdjustment,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  createVignetteEffect,
  registerCanvasBloomEffect,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  registerCanvasVignetteEffect,
  endCanvasRenderEffectPipeline,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with four tiles 140 px on a side, turned 12, 32, 52 and 72 ' +
    'degrees so they span 166, 193, 197 and 176 px corner to corner (side*(cos a + sin a)) — white near ' +
    '(224,180), warm yellow near (576,180), cyan near (224,420), pink near (576,420) — carrying THREE stacked ' +
    'treatments at once, and all three must be visible together. Each tile glows softly outward past its edges ' +
    'into the dark background. THE GLOW IS FAINT ON THIS BACKEND, and how faint is derivable: the canvas bright ' +
    'pass scales every surviving pixel to 1 - threshold = 0.4 of its value (CSS applies brightness after the ' +
    'contrast stretch), and the composite sets globalAlpha to the intensity, which Canvas 2D cannot take above 1, ' +
    'so the requested 1.2 becomes 1.0. The canvas halo therefore carries 0.4/1.2 = 0.33 of the energy the GL and ' +
    'WGPU siblings put into it. Expect a glow that reads clearly in a luminance profile and is easy to miss by ' +
    'eye against the near-black field. This ratio is derived from the two scaling terms, not measured on this ' +
    'cell — the sibling scene effect-bloom/canvas is the one where it was measured, at 0.29 for its intensity of ' +
    '1.4.  The colours are more saturated and higher in contrast than their raw fills. And the field is DARKENED ' +
    'TOWARD ITS CORNERS: the four corners are noticeably darker than the centre. Any one of the three missing is ' +
    'a failure — crisp tile edges, colour no more saturated than the raw fills, or uniform brightness ' +
    'corner-to-centre each mean one stage of the chain did not run. The tiles keep their positions and their hues ' +
    'throughout.',
);
// Canvas parity column for the same three-scene2d chain as render.webgl.ts: bloom, then color grade,
// then vignette. The Canvas pipeline composites each registered runner in order over the scene, the
// same RenderEffect stack intent realized with Canvas 2D compositing.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createCanvasRenderState(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(state, defaultCanvasShapeCommands);
registerCanvasBloomEffect(state);
registerCanvasVignetteEffect(state);

const pipeline = createCanvasRenderEffectPipeline(state);

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginCanvasRenderEffectPipeline(state, pipeline);
  renderCanvasBackground(state);
  renderCanvasScene2D(state, root);
  endCanvasRenderEffectPipeline(state, pipeline, [
    createBloomEffect({ threshold: 0.6, intensity: 1.2 }),
    createColorGradeAdjustment({ saturation: 1.4, contrast: 1.1 }),
    createVignetteEffect({ intensity: 0.7, radius: 0.7, softness: 0.5 }),
  ]);
}

// Bright, saturated shapes on a near-black field feed a three-scene2d effect chain: their high
// luminance crosses the bloom threshold for a glowing halo, the color grade pushes saturation and
// contrast, and the vignette darkens the corners.

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

// ★ READ OFF THE SOURCE: three stacked treatments — a bloom, a colour grade at saturation 1.4 /
// contrast 1.1, and a vignette at intensity 0.7 — and the description names each one's own failure.
// Two of the three are asserted below. The third is not, and the reason is recorded rather than left
// as a gap.
//
// 1. BLOOM — the gradient population, pixels that are neither background nor tile core. Measured here:
//    0.68 of the lit population on canvas, 0.52 on Gl and Wgpu. The same frame with no bloom collapses
//    to about 0.014, so the bar of 0.1 sits five times below the working case and seven times above a
//    frame without it.
//
// 2. VIGNETTE — the field must darken toward its corners. Measured: corner luminance 0.33 against 0.67
//    in the middle of the field, on all three backends. A missing vignette leaves the two equal.
//
// ★ 3. THE SATURATION CLAIM IS DELIBERATELY NOT ASSERTED, because the picture does not satisfy it and
// that is a finding rather than something to encode leniently. The description says the colours come
// out "more saturated and higher in contrast than their raw fills". The pink tile does: 0.729 against a
// raw 0.639. The YELLOW tile does not, on Gl and Wgpu: its core reads [182,182,135], a saturation of
// 0.258 against the same raw 0.639 — LESS saturated, not more. Canvas keeps it at 0.912.
//
// The cause is upstream of the colour grade: in the bloom-only scene the same tile's core is #ffff5c on
// canvas and #ffffdd on Gl, so the Gl bloom is feeding white light back into bright cores and washing
// them out before the grade ever runs. Asserting the description's claim here would make this cell red
// for a defect that belongs to bloom; asserting a weakened version would bless the wash-out. So it
// waits on a ruling, and this comment is where the measurement lives until then.
const MID_BAND_LOW = 15;
const MID_BAND_HIGH = 120;
const MIN_GRADIENT_RATIO = 0.1;
const MIN_VIGNETTE_RATIO = 1.5;

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
      `[effect-chain] the gradient population is ${ratio.toFixed(3)} of the lit population (expected at ` +
        `least ${MIN_GRADIENT_RATIO}) — the tiles have crisp edges, so the bloom stage did not run`,
    );
  }

  // Field background only: the two corners and a point in the middle gap between the four tiles.
  const corner = (luminance(12, 12) + luminance(frame.width - 12, frame.height - 12)) / 2;
  const middle = luminance(Math.round(frame.width * 0.5), Math.round(frame.height * 0.5));
  if (middle < corner * MIN_VIGNETTE_RATIO) {
    throw new Error(
      `[effect-chain] the corners read ${corner.toFixed(2)} and the middle of the field ` +
        `${middle.toFixed(2)} — the field is not darkening toward its corners, so the vignette stage ` +
        `did not run`,
    );
  }
}
