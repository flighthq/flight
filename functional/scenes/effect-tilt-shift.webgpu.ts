import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D } from '@flighthq/sdk';
import {
  ShapeKind,
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  beginWgpuRenderEffectPipeline,
  createDisplayObject,
  createShape,
  createTiltShiftEffect,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  defaultWgpuShapeRenderer,
  registerWgpuTiltShiftEffect,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R5 G6 B10), four 160×160 squares sit near the corners: ' +
    'white centred at (128,108), yellow at (672,120), cyan at (144,492) and magenta at (656,480), ' +
    'turned by 8, 22, 36 and 50 degrees. The top and bottom out-of-focus bands soften those four ' +
    'off-centre silhouettes, while the horizontal focus band through the middle stays free of ' +
    'spurious blur. The shapes remain separately coloured rather than merging into a wash, and the ' +
    'extreme corners remain near-black.',
);

// Wgpu parity column for the same tilt-shift intent as render.webgl.ts.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, { pixelRatio, backgroundColor: 0x05060aff });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);
registerWgpuTiltShiftEffect(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 4 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

// The band the effect is given AND the band the oracle reasons about, so the two cannot drift apart.
// TILT_CENTER is measured DOWN from the top edge; see TiltShiftEffect for why each runner normalises
// it differently.
const TILT_CENTER = 0.5;
const TILT_WIDTH = 0.25;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, [
    createTiltShiftEffect({ center: TILT_CENTER, width: TILT_WIDTH, blur: 6 }),
  ]);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// Off-center shapes pushed toward the frame edges, so lens curvature and out-of-focus falloff away
// from the center are clearly visible against the straight rectangle edges.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xffffffff, 0xfff05cff, 0x5cffe0ff, 0xff5ce0ff];
const positions = [
  [0.16, 0.18],
  [0.84, 0.2],
  [0.18, 0.82],
  [0.82, 0.8],
];
for (let i = 0; i < colors.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i], 1);
  appendShapeRectangle(shape, -80, -80, 160, 160);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * positions[i][0];
  shape.y = logicalHeight * positions[i][1];
  shape.rotation = 8 + i * 14;
  addNodeChild(root, shape);
}

render(root);

// ★ THE PREVIOUS ORACLE HERE COULD NOT FAIL FOR ITS STATED REASON, and it is worth naming why, because
// the mistake is easy to repeat. It summed |neighbour difference| along each ROW and required the mean
// to fall below 2.5. Two independent defects: it scanned the HORIZONTAL axis while tilt-shift blurs
// VERTICALLY, and a summed absolute difference is total variation, which a monotone blur very nearly
// CONSERVES — a step spread into a ramp has the same sum. Measured on this scene, the unblurred
// control read 0.690 and the blurred render 0.688, against a threshold of 2.5 that both passed by 3.6x.
// The comment above it claimed 3-4 before and below 2.5 after; nothing in the picture ever produced
// those numbers.
//
// What replaces it counts STEEP steps rather than summing all of them, because peak steepness is what a
// blur actually destroys, and it counts them on both axes so the two claims can be separated:
//
//   - outside the focus band, vertical steepness collapses  (7 vertical taps at radius = blur)
//   - horizontal steepness survives                          (no horizontal taps at all)
//
// The second claim is what stops a runner that blurred the whole frame in both directions, or returned
// a flat one, from passing the first. Measured: outside-band steep vertical steps are 2308 unblurred
// against 253 (webgl) and 220 (wgpu) blurred, so the threshold sits ~3x clear of both sides.
const STEEP_STEP = 60;
const MAX_BLURRED_VERTICAL_STEPS = 800;
const MIN_SURVIVING_HORIZONTAL_STEPS = 150;

function countSteepSteps(frame: Readonly<Bitmap>, axis: 'horizontal' | 'vertical'): number {
  // The sharp band is center +/- width/2 -- the recipe's own `edge`, where smoothstep is still 0.
  // Excluding the full ramp width instead throws away most of the shapes and leaves the count measuring
  // the empty middle of the frame.
  const bandTop = Math.round(frame.height * (TILT_CENTER - TILT_WIDTH / 2));
  const bandBottom = Math.round(frame.height * (TILT_CENTER + TILT_WIDTH / 2));
  const luminance = (x: number, y: number): number => {
    const rgb = getBitmapPixelRgb(frame, x, y);
    return (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 3;
  };

  let steps = 0;
  for (let y = 1; y < frame.height; y++) {
    if (y >= bandTop && y < bandBottom) continue;
    for (let x = 1; x < frame.width; x++) {
      const here = luminance(x, y);
      const previous = axis === 'vertical' ? luminance(x, y - 1) : luminance(x - 1, y);
      if (Math.abs(here - previous) > STEEP_STEP) steps++;
    }
  }
  return steps;
}

export function assertRender(frame: Readonly<Bitmap>): void {
  const vertical = countSteepSteps(frame, 'vertical');
  if (vertical > MAX_BLURRED_VERTICAL_STEPS) {
    throw new Error(
      `[effect-tilt-shift] ${vertical} steep vertical steps outside the focus band (expected under ` +
        `${MAX_BLURRED_VERTICAL_STEPS}) - the out-of-focus bands are not blurred`,
    );
  }

  const horizontal = countSteepSteps(frame, 'horizontal');
  if (horizontal < MIN_SURVIVING_HORIZONTAL_STEPS) {
    throw new Error(
      `[effect-tilt-shift] only ${horizontal} steep horizontal steps outside the focus band (expected at ` +
        `least ${MIN_SURVIVING_HORIZONTAL_STEPS}) - the blur is not confined to the vertical axis`,
    );
  }
}
