import type { Bitmap, GlRenderEffectPipeline, Node2D } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginGlRenderEffectPipeline,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createInnerShadowEffect,
  createShape,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerGlInnerShadowEffect,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  ShapeKind,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On an opaque near-black 800x600 field (about R5 G6 B10), one flat white 200x200 square sits with its ' +
    'top-left corner at (300,200). A dark inner shadow hugs the INSIDE of the square along its TOP and LEFT ' +
    'edges, fading over about 8 pixels, and the inside of its bottom and right edges stays white. THE SHADED ' +
    'EDGES ARE THE POINT: an inner shadow at angle 45 degrees - measured from +X toward +Y in screen space, ' +
    'clockwise as displayed - darkens the edges the light is coming FROM, which are the ones opposite the ' +
    'offset direction. Shading along the bottom and right instead would mean the runner read the angle in a ' +
    'bottom-left-origin space. Outside the square the field stays near-black.',
);

// The angle the effect is given AND the angle the oracle reasons about, so the two cannot drift apart.
// Deliberately OFF-AXIS: at 0 or 90 the offset lands on one axis only, and a Y-origin error is then
// either invisible or indistinguishable from a sign convention. 45 degrees puts it on both.
const SHADOW_ANGLE = 45;
const SHADOW_DISTANCE = 57;

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
registerGlInnerShadowEffect(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, { sampleCount: 4 });

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
    createInnerShadowEffect({
      angle: SHADOW_ANGLE,
      blurX: 8,
      blurY: 8,
      color: 0x000000ff,
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
// inside the square against the band just opposite it and requires the named one to be darker.
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

  // Bands just INSIDE the square on each axis: the shaded ones are those the light comes from.
  const insideTop = meanLuminance(SQUARE_X + 40, SQUARE_Y + 4, SQUARE_X + SQUARE - 40, SQUARE_Y + 28);
  const insideBottom = meanLuminance(
    SQUARE_X + 40,
    SQUARE_Y + SQUARE - 28,
    SQUARE_X + SQUARE - 40,
    SQUARE_Y + SQUARE - 4,
  );
  const insideLeft = meanLuminance(SQUARE_X + 4, SQUARE_Y + 40, SQUARE_X + 28, SQUARE_Y + SQUARE - 40);
  const insideRight = meanLuminance(
    SQUARE_X + SQUARE - 28,
    SQUARE_Y + 40,
    SQUARE_X + SQUARE - 4,
    SQUARE_Y + SQUARE - 40,
  );

  if (insideTop >= insideBottom - 6) {
    throw new Error(
      `[effect-inner-shadow] the inside top edge is ${insideTop.toFixed(1)} and the inside bottom edge is ` +
        `${insideBottom.toFixed(1)} — at angle ${SHADOW_ANGLE} the TOP edge must be the shaded one; an ` +
        `equal or darker bottom means the angle was read in a bottom-left-origin space`,
    );
  }
  if (insideLeft >= insideRight - 6) {
    throw new Error(
      `[effect-inner-shadow] the inside left edge is ${insideLeft.toFixed(1)} and the inside right edge ` +
        `is ${insideRight.toFixed(1)} — at angle ${SHADOW_ANGLE} the LEFT edge must also be shaded`,
    );
  }
}
