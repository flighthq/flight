import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createDropShadowEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createShape,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlDropShadowEffect,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an opaque near-black 800x600 field (about R5 G6 B10), one flat white 200x200 square sits with its ' +
    'top-left corner at (300,200). A bright blue (0x4080ff) shadow of the same square is offset DOWN AND TO THE RIGHT ' +
    'by 40 pixels on each axis - angle 45 degrees at distance 57 - and blurred by 8 pixels, so it reads as a ' +
    'soft blue band along the bottom and right edges of the square and nowhere along the top or left. THE ' +
    'OFFSET DIRECTION IS THE POINT: 45 degrees is measured from +X toward +Y in screen space, which is ' +
    'clockwise as displayed, so the shadow falls toward the bottom-right corner of the frame. A shadow ' +
    'appearing above the square instead would mean the runner read the angle in a bottom-left-origin space. The ' +
    'rest of the field stays near-black.',
);

// The angle the effect is given AND the angle the oracle reasons about, so the two cannot drift apart.
// Deliberately OFF-AXIS: at 0 or 90 the offset lands on one axis only, and a Y-origin error is then
// either invisible or indistinguishable from a sign convention. 45 degrees puts it on both.
const SHADOW_ANGLE = 45;
const SHADOW_DISTANCE = 57;

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x05060aff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlDropShadowEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;
const SQUARE = 200;
const SQUARE_X = 300;
const SQUARE_Y = 200;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  // The background is drawn OUTSIDE the effect pipeline on purpose. A drop shadow works on the source
  // SILHOUETTE, and drawing an opaque background into the pipeline first makes the silhouette the whole
  // frame — the offset shadow then lands underneath opaque pixels and nothing is visible anywhere.
  renderGlBackground(state);
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlScene2D(state, root);
  endGlRenderEffectPipeline(state, pipeline, [
    createDropShadowEffect({
      angle: SHADOW_ANGLE,
      blurX: 8,
      blurY: 8,
      color: 0x4080ffff,
      distance: SHADOW_DISTANCE,
      strength: 1,
    }),
  ]);
}

const root = createDisplayObject();

const shape = createShape();
appendShapeBeginFill(shape, 0xffffffff, 1);
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

  // Bands just outside the square on each axis, where the offset shadow lands or does not.
  const below = meanLuminance(SQUARE_X + 40, SQUARE_Y + SQUARE + 4, SQUARE_X + SQUARE, SQUARE_Y + SQUARE + 36);
  const above = meanLuminance(SQUARE_X + 40, SQUARE_Y - 36, SQUARE_X + SQUARE, SQUARE_Y - 4);
  const right = meanLuminance(SQUARE_X + SQUARE + 4, SQUARE_Y + 40, SQUARE_X + SQUARE + 36, SQUARE_Y + SQUARE);
  const left = meanLuminance(SQUARE_X - 36, SQUARE_Y + 40, SQUARE_X - 4, SQUARE_Y + SQUARE);

  if (below <= above + 20) {
    throw new Error(
      `[effect-drop-shadow] the band below the square is ${below.toFixed(1)} and the band above it is ` +
        `${above.toFixed(1)} — at angle ${SHADOW_ANGLE} the shadow must fall DOWNWARD in screen space; ` +
        `an equal or darker band below means the angle was read in a bottom-left-origin space`,
    );
  }
  if (right <= left + 20) {
    throw new Error(
      `[effect-drop-shadow] the band right of the square is ${right.toFixed(1)} and the band left of it ` +
        `is ${left.toFixed(1)} — at angle ${SHADOW_ANGLE} the shadow must also fall to the RIGHT`,
    );
  }
}
