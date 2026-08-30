import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  scene2dGlPipeline,
  createGlContextState,
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createChromaticAberrationEffect,
  createDisplayObject,
  getBitmapPixelRgb,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  registerGlChromaticAberrationEffect,
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
  'An 800x600 field on a very dark background with five square tiles 100 px on a side, turned 0, 15, 30, 45 and ' +
    '60 degrees so they span 100, 122, 137, 141 and 137 px corner to corner (side*(cos a + sin a)): four near the ' +
    'corners at roughly (128,120), (672,120), (128,480) and (672,480), and one centred at (400,300). They are ' +
    'turned by increasing angles in that order, so the FIRST CORNER tile at (128,120) sits square to the field, ' +
    'unrotated, and the CENTRE tile is the most turned of the five. Each tile edge shows COLOUR FRINGING — a thin ' +
    'red-ish edge on one side and a blue-ish edge on the other, rather than a clean boundary between tile and ' +
    'background. The fringing is RADIAL: it grows with distance from the centre of the field, so the four corner ' +
    'tiles fringe noticeably while the centre tile is nearly clean. A picture where every tile fringes equally, ' +
    'or where the centre tile fringes as strongly as the corners, is wrong. The tiles themselves stay in place ' +
    'and keep their fill colours in their interiors.',
);
// Chromatic aberration: the R/G/B channels are sampled with a growing radial offset toward the edges,
// fringing high-contrast borders. Sharp edges away from center show the red/blue split clearly.
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
    backgroundColor: 0x101014ff,
  },
);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlChromaticAberrationEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createChromaticAberrationEffect({ intensity: ABERRATION_INTENSITY, radial: true }),
  ]);
}

// High-contrast white shapes on a dark field, pushed toward the corners where radial aberration is
// strongest. The crisp edges make the per-channel color fringing easy to see.

// The offset the shader applies is `dir * intensity * length(uv - 0.5) * 2`, in UV units — so at the
// corner tiles (uv distance about 0.453 from centre) an intensity of 0.01 displaces the R and B taps by
// roughly 7 px, a thin fringe on a 100 px tile, while the centre tile at distance 0 is untouched.
//
// ★ THIS VALUE WAS 4, WHICH IS 800x THE RECIPE'S OWN DEFAULT AND READS AS THOUGH THE UNIT WERE PIXELS.
// At 4 the taps land thousands of pixels away, every tile interior came out pure green, and the scene
// could no longer show what it exists to show: a clipped effect looks the same whether its radial
// falloff is right or badly wrong. A saturated parameter hides magnitude and shape exactly as a neutral
// one hides direction.
//
// ★ WHY THE DESCRIPTION WAS TREATED AS AUTHORITATIVE HERE, AND WHY THAT IS NOT A GENERAL RULE. When the
// text and the picture disagreed, the text won for one reason only: it states the more DISCRIMINATING
// test. Its radial claim — no fringing at the optical centre, growing with radius — is a property a
// check can fail on, and the saturated picture was one no check could distinguish from a badly wrong
// implementation. Had the description instead demanded something the effect cannot do, the description
// would have been the thing to fix. Nothing here says prose outranks pixels; it says the falsifiable
// artifact outranks the unfalsifiable one.
const ABERRATION_INTENSITY = 0.01;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const TILE_POSITIONS = [
  [0.16, 0.2],
  [0.84, 0.2],
  [0.16, 0.8],
  [0.84, 0.8],
  [0.5, 0.5],
];
for (let i = 0; i < TILE_POSITIONS.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, 0xffffffff, 1);
  appendShapeRectangle(shape, -50, -50, 100, 100);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * TILE_POSITIONS[i][0];
  shape.y = logicalHeight * TILE_POSITIONS[i][1];
  shape.rotation = i * 15;
  addNodeChild(root, shape);
}

render(root);

// Radial chromatic aberration (intensity 4) separates RGB channels outward from center. Edge pixels
// of shapes show channel fringing — the R, G, and B channels sample from slightly different positions.
// A background pixel adjacent to a shape edge should show color fringing (channel imbalance > 15)
// from the offset channel samples. Without the effect, edge-adjacent background pixels are uniform
// near-black and the maximum channel difference is ~1.

// ★ READ OFF THE SOURCE: the shader offsets the R and B taps by `dir * intensity * length(uv - 0.5) * 2`
// with `radial` true, so the displacement is ZERO at the frame centre and grows with distance. The scene
// puts one tile at the exact centre and four identical tiles at the same radius, which hands the check a
// control it did not have to construct: the centre tile is the same subject under the same effect at the
// one radius where the effect must do nothing.
//
// ★ THE ORACLE THIS REPLACED SAT AT THE LOCUS OF LEAST EFFECT. It scanned the single column
// `x = width * 0.5` — the line of least radial fringing, crossing only the centre tile — and asked
// whether any pixel on it reached a channel imbalance of 15. That verdict is the same on a uniform
// non-radial render, on one ten times too strong, and on the picture the description promises: three
// different images, one answer.
//
// The three claims below separate all three, and each is measured. With the effect correct: corner
// means 38-44, centre 13.5, corner spread 14 per cent, interiors #ffffff. With intensity at its former
// saturated value: corner mean 85.3 and centre 84.8 — a ratio of 0.99, which claim 2 rejects — and the
// interiors read #10ff14, which claim 3 rejects.
const TILE_PROBE = 85;
const MIN_CORNER_FRINGING = 25;
const MAX_CENTRE_FRACTION = 0.6;
const MAX_CORNER_SPREAD = 1.5;
const MIN_INTERIOR_CHANNEL = 200;

function meanChannelImbalance(frame: Readonly<Bitmap>, centreX: number, centreY: number): number {
  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, centreY - TILE_PROBE); y < Math.min(frame.height, centreY + TILE_PROBE); y++) {
    for (let x = Math.max(0, centreX - TILE_PROBE); x < Math.min(frame.width, centreX + TILE_PROBE); x++) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      const red = (rgb >> 16) & 255;
      const green = (rgb >> 8) & 255;
      const blue = rgb & 255;
      sum += Math.max(red, green, blue) - Math.min(red, green, blue);
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

export function assertRender(frame: Readonly<Bitmap>): void {
  const at = (fx: number, fy: number): [number, number] => [
    Math.round(frame.width * fx),
    Math.round(frame.height * fy),
  ];
  const corners = TILE_POSITIONS.slice(0, 4).map(([fx, fy]) => meanChannelImbalance(frame, ...at(fx, fy)));
  const centre = meanChannelImbalance(frame, ...at(0.5, 0.5));

  // 1. the effect is present where the radius is large
  const weakest = Math.min(...corners);
  if (weakest < MIN_CORNER_FRINGING) {
    throw new Error(
      `[effect-chromatic-aberration] the least-fringed corner tile has mean channel imbalance ` +
        `${weakest.toFixed(1)} (expected at least ${MIN_CORNER_FRINGING}) — no fringing at radius`,
    );
  }

  // 2. and ABSENT where the radius is zero. This is the claim a uniform, non-radial aberration fails,
  //    and the one a saturated render fails too, because saturation lifts the centre with everything else.
  if (centre > weakest * MAX_CENTRE_FRACTION) {
    throw new Error(
      `[effect-chromatic-aberration] the centre tile has mean channel imbalance ${centre.toFixed(1)} ` +
        `against ${weakest.toFixed(1)} at the corners — the fringing is not falling off toward the ` +
        `optical centre, so it is either not radial or strong enough to clip everywhere`,
    );
  }

  // 3. the four corners share one radius, so they must share one answer
  const spread = Math.max(...corners) / Math.max(1e-6, weakest);
  if (spread > MAX_CORNER_SPREAD) {
    throw new Error(
      `[effect-chromatic-aberration] the four corner tiles disagree by ${spread.toFixed(2)}x ` +
        `(expected at most ${MAX_CORNER_SPREAD}x) — tiles at equal radius must fringe equally`,
    );
  }

  // 4. and the tiles keep their fill in their interiors, which is what "thin fringe" means
  const [ix, iy] = at(TILE_POSITIONS[0]![0], TILE_POSITIONS[0]![1]);
  const interior = getBitmapPixelRgb(frame, ix, iy);
  for (const shift of [16, 8, 0]) {
    if (((interior >> shift) & 255) < MIN_INTERIOR_CHANNEL) {
      throw new Error(
        `[effect-chromatic-aberration] a corner tile interior reads #${(interior & 0xffffff)
          .toString(16)
          .padStart(6, '0')} rather than its white fill — the channels have separated across the whole ` +
          `tile instead of fringing at its edges`,
      );
    }
  }
}
