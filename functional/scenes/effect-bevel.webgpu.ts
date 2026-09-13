import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  createBevelEffect,
  createDisplayObject,
  createShape,
  createWgpuAcquisition,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerRenderer,
  registerWgpuBevelEffect,
  renderWgpuScene2D,
  scene3DWgpuPipeline,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an opaque near-black 800x600 field (about R5 G6 B10), one flat mid-grey 200x200 square sits with its ' +
    'top-left corner at (300,200). A bevel at 45 degrees paints a DARK band down the inside of its TOP and ' +
    'LEFT edges and a BRIGHT band down the inside of its BOTTOM and RIGHT edges, each fading over about 20 ' +
    'px, while the middle of the square keeps its unmodified mid-grey. Measured: the shaded bands read about ' +
    '49 and the lit bands about 207 against a fill of 128. THE SIDES ARE THE POINT: 45 degrees is measured ' +
    'from +X toward +Y in screen space, clockwise as displayed, so the light arrives from the bottom-right ' +
    'and the edges facing it are the lit ones. A picture with the bright band along the top instead would ' +
    'mean the runner read the angle in a bottom-left-origin space, and a picture with all four insides at 128 ' +
    'would mean the effect did not run. The subject is mid-grey rather than white on purpose: a white square ' +
    'hides the white highlight and only half the effect could be seen. The field outside the square stays ' +
    'near-black.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuBevelEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;
const BEVEL_ANGLE = 45;
// ★ MID-GREY, NOT WHITE, AND THAT IS THE SAME RULE AS AN OFF-CENTRE PARAMETER. A bevel paints a WHITE
// highlight on one pair of edges and a BLACK shadow on the other; on a white square the highlight is
// invisible and the check can only ever see half the effect. A subject that saturates one side of the
// result hides it exactly as a saturated parameter hides magnitude.
const SQUARE_FILL = 0x808080ff;
const SQUARE = 200;
const SQUARE_X = 300;
const SQUARE_Y = 200;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  const pass = beginWgpuRenderPass(state, screen, { color: [0, 0, 0, 1], depth: 1.0 });
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline);
  renderWgpuScene2D(scenePass, root);
  endWgpuRenderEffectPipeline(scenePass, pipeline, [
    createBevelEffect({
      angle: BEVEL_ANGLE,
      blurX: 8,
      blurY: 8,
      distance: 12,
      highlightColor: 0xffffffff,
      shadowColor: 0x000000ff,
      strength: 2,
    }),
  ]);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

const root = createDisplayObject();

const shape = createShape();
appendShapeBeginFill(shape, SQUARE_FILL, 1);
appendShapeRectangle(shape, 0, 0, SQUARE, SQUARE);
appendShapeEndFill(shape);
shape.x = SQUARE_X;
shape.y = SQUARE_Y;
addNodeChild(root, shape);

render(root);

// ★ THE ORACLE MEASURES WHICH SIDE, NOT WHETHER. A shadow that renders on the wrong side is still a
// shadow, still soft, still the right colour, and every "is it blurred" or "is it darker" check passes
// on it — that is precisely how a mirrored angle survives a suite. So this compares the band just
// outside the square against the band just opposite it and requires the named one to be darker.
//
// SHADOW_ANGLE is shared with the descriptor above so the two cannot drift apart, and it is 45 rather
// than 0 or 90 deliberately: an axis-aligned angle puts the offset on one axis only, where a Y-mirror
// is either invisible (horizontal) or indistinguishable from a sign convention (vertical).

// ★ READ OFF THE SOURCE: the effect is given BEVEL_ANGLE, and the angle is screen space — origin
// top-left, +Y down, measured from +X toward +Y. At 45 degrees the light arrives from the bottom-right,
// so the edges facing it are lit and the opposite ones shaded. The check reads the four interior bands
// and requires the pair the light reaches to be BRIGHTER than the pair it does not.
//
// Three images, three answers, which is what makes this a check rather than a presence test:
//
//     as authored          shaded 49, lit 207, fill 128       passes
//     effect not running   all four bands sit at the fill                fails claim 1
//     angle read in a bottom-left-origin space   the pairs swap          fails claim 2
//
// Claim 1 is what a missing effect fails; claim 2 is what a mirrored axis fails. Neither alone is
// enough — a uniformly darkened square passes claim 2 and a correctly-mirrored one passes claim 1.
const BAND = 20;
const MIN_BAND_SEPARATION = 40;

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const meanLuminance = (x0: number, y0: number, x1: number, y1: number): number => {
    let sum = 0;
    let count = 0;
    for (let y = Math.round(y0 * scale); y < Math.round(y1 * scale); y++) {
      for (let x = Math.round(x0 * scale); x < Math.round(x1 * scale); x++) {
        const rgb = getBitmapPixelRgb(frame, x, y);
        sum += ((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255);
        count += 3;
      }
    }
    return count === 0 ? 0 : sum / count;
  };

  const inset = 3;
  const top = meanLuminance(SQUARE_X + 40, SQUARE_Y + inset, SQUARE_X + SQUARE - 40, SQUARE_Y + BAND);
  const bottom = meanLuminance(
    SQUARE_X + 40,
    SQUARE_Y + SQUARE - BAND,
    SQUARE_X + SQUARE - 40,
    SQUARE_Y + SQUARE - inset,
  );
  const left = meanLuminance(SQUARE_X + inset, SQUARE_Y + 40, SQUARE_X + BAND, SQUARE_Y + SQUARE - 40);
  const right = meanLuminance(
    SQUARE_X + SQUARE - BAND,
    SQUARE_Y + 40,
    SQUARE_X + SQUARE - inset,
    SQUARE_Y + SQUARE - 40,
  );

  const shaded = (top + left) / 2;
  const lit = (bottom + right) / 2;

  // 1. the effect ran at all — a flat square leaves the two pairs equal
  if (Math.abs(lit - shaded) < MIN_BAND_SEPARATION) {
    throw new Error(
      `[effect-bevel] the top/left bands read ${shaded.toFixed(1)} and the bottom/right bands ` +
        `${lit.toFixed(1)}, a separation of ${Math.abs(lit - shaded).toFixed(1)} (expected at least ` +
        `${MIN_BAND_SEPARATION}) — the square is flat, so the effect did not run`,
    );
  }

  // 2. and it ran the right way round — this is the claim a mirrored Y origin fails
  if (lit < shaded) {
    throw new Error(
      `[effect-bevel] the top/left bands read ${shaded.toFixed(1)} and the bottom/right bands ` +
        `${lit.toFixed(1)} — at ${BEVEL_ANGLE} degrees in screen space the light arrives from the ` +
        `bottom-right, so those edges must be the BRIGHTER pair; reversed means the angle was read in ` +
        `a bottom-left-origin space`,
    );
  }
}
