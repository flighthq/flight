import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
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
  createGlContextFromCanvasElement,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R5 G6 B10), four 110×110 rotated squares form a loose ' +
    'zig-zag across the middle: white at (160,240), yellow at (320,312), cyan at (480,240) and ' +
    'magenta at (640,312), turned by 10, 28, 46 and 64 degrees. Their colour and edges smear radially ' +
    'away from the field centre at (400,300), producing soft zoom-like streaks and no crisp square ' +
    'boundary. The four sources remain individually readable rather than blending into one central ' +
    'cloud, and the outer corners stay near-black instead of being filled by colour.',
);

// The blur centre the effect is given AND the centre the oracle reasons about, so the two cannot drift
// apart. Deliberately OFF-CENTRE: centerY 0.5 is its own mirror, so a scene using it cannot reveal a
// Y-origin error in the very parameter it is exercising. 0.4 sits on the upper row of shapes, which
// makes that row the sharpest part of the frame and the lower row the blurrier one — a comparison that
// reverses sign if the convention is wrong.
const RADIAL_CENTER_Y = 0.4;

// Radial blur: the full frame smears radially outward from the configured center, so mid-screen
// shapes streak toward the edges like a zoom blur.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  }),
  {
    pixelRatio,
    backgroundColor: 0x05060aff,
  },
);
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlRadialBlurEffect(state);

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
    createRadialBlurEffect({ centerX: 0.5, centerY: RADIAL_CENTER_Y, strength: 0.4, samples: 12 }),
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

// ★ THE PREVIOUS ORACLE HERE COULD NOT SEE THE PARAMETER UNDER TEST. It summed |neighbour difference|
// along each row and required the mean under 1.5 — a total-variation measure, which a monotone blur
// very nearly CONSERVES, and which says nothing at all about WHERE the blur is centred. That is the
// property this scene exists to exercise, and the property that was wrong on Gl.
//
// What replaces it counts STEEP steps, which a blur does destroy, and it makes two claims that a
// mirrored centre fails:
//
//   1. the band around RADIAL_CENTER_Y stays sharp — it is the fixed point of the remap, so edges
//      there survive at full contrast
//   2. it is SHARPER THAN the band below it — which is what stops a frame that simply was not blurred
//      from satisfying claim 1
//
// Measured with the convention correct: upper band 64 steep steps on Gl and 107 on Wgpu, against 25
// and 57 in the lower band. With Gl's conversion removed the centre lands at 1 - 0.4 = 0.6, where no
// shape sits, and NO band anywhere in the frame keeps a single step above the threshold — the whole
// picture smears. So the mirrored render fails claim 1 by the widest possible margin, 0 against 20.
const STEEP_STEP = 60;
const MIN_CENTRE_BAND_STEPS = 20;
const MIN_CENTRE_SHARPNESS_RATIO = 1.3;

function countSteepSteps(frame: Readonly<Bitmap>, from: number, to: number): number {
  const luminance = (x: number, y: number): number => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
  };
  let steps = 0;
  for (let y = Math.round(frame.height * from); y < Math.round(frame.height * to); y++) {
    for (let x = 1; x < frame.width; x++) {
      if (Math.abs(luminance(x, y) - luminance(x - 1, y)) > STEEP_STEP) steps++;
    }
  }
  return steps;
}

export function assertRender(frame: Readonly<Bitmap>): void {
  const centre = countSteepSteps(frame, RADIAL_CENTER_Y - 0.06, RADIAL_CENTER_Y + 0.06);
  if (centre < MIN_CENTRE_BAND_STEPS) {
    throw new Error(
      `[effect-radial-blur] only ${centre} steep steps in the band at centerY ${RADIAL_CENTER_Y} ` +
        `(expected at least ${MIN_CENTRE_BAND_STEPS}) — the blur centre is not where the descriptor put ` +
        `it; check that this backend converts centerY into its own texcoord space at its own seam`,
    );
  }

  const below = countSteepSteps(frame, RADIAL_CENTER_Y + 0.06, RADIAL_CENTER_Y + 0.18);
  if (centre < below * MIN_CENTRE_SHARPNESS_RATIO) {
    throw new Error(
      `[effect-radial-blur] the band at centerY has ${centre} steep steps and the band below it has ` +
        `${below} — the centre is not sharper than its surroundings, so the frame is not radially ` +
        `blurred about that point`,
    );
  }
}
