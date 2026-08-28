import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import type { Bitmap, Node2D, GlRenderEffectPipeline } from '@flighthq/sdk';
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
  createOutlineEffect,
  createShape,
  registerGlOutlineEffect,
  defaultGlShapeRenderer,
  endGlRenderEffectPipeline,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlScene2D,
  getBitmapPixelRgb,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'Eighteen small rotated rectangles (56×20 each, six cycling colors: pink 0xff5c7c, green 0x5cff9c, blue 0x5c9cff, gold 0xffd25c, purple 0xd25cff, cyan 0x5cf0ff) on a dark 800×600 background (0x101014) in a 5×4 grid (x centers at ~96/240/384/528/672, y centers at ~108/228/348/468; last row has 3), each rotated by i×22°. Solid black (0x000000) outlines trace every shape edge and color boundary with thickness 2 and threshold 0.2. Shapes with no black outline strokes at their edges is a failure.',
);

// outline: a full-frame stylization pass applied to the whole scene through a default rgba8 pipeline.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x101014ff,
});
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
registerGlStandardMaterial(state);
registerGlOutlineEffect(state);

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
    createOutlineEffect({ threshold: 0.2, thickness: 2, color: 0x000000ff }),
  ]);
}

// Many small, rotated, overlapping shapes pack the frame with fine detail and diagonal edges, giving
// the outline effect dense high-frequency content (edges, quantizable color, sample neighborhoods)
// to act on.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const colors = [0xff5c7cff, 0x5cff9cff, 0x5c9cffff, 0xffd25cff, 0xd25cffff, 0x5cf0ffff];
for (let i = 0; i < 18; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, colors[i % colors.length], 1);
  appendShapeRectangle(shape, -28, -10, 56, 20);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.12 + 0.18 * (i % 5));
  shape.y = logicalHeight * (0.18 + 0.2 * Math.floor(i / 5));
  shape.rotation = i * 22;
  addNodeChild(root, shape);
}

render(root);

// The outline pass draws pure black (0x000000ff) edges over a 0x101014ff background, so black is a color
// only the outline can produce — every other pixel in the scene is either the backdrop or a saturated
// fill. Counting pixels below 8 on every channel therefore counts outline directly. Measured with the
// effect applied vs the same scene with the pipeline bypassed: 2.82% of the frame vs exactly 0%. The
// fingerprint cannot see it: its committed grid scores 4.64 against a uniform frame of its own
// background, under the gate's threshold of 5.
export function assertRender(frame: Readonly<Bitmap>): void {
  assertOutlineLocations(frame);

  const ink = measureOutlineInk(frame);
  if (ink < 0.01) {
    throw new Error(
      `[effect-outline] pure-black ink covers ${(ink * 100).toFixed(3)}% of the frame (expected >= 1%) — the ` +
        `shapes carry no outline`,
    );
  }
}

const EXPECTED_FILL_RGB = [0xff5c7c, 0x5cff9c, 0x5c9cff, 0xffd25c, 0xd25cff, 0x5cf0ff] as const;
const MIN_LOCAL_OUTLINE_INK = 400;

// Global ink can be rearranged without changing its count. Bind both each fill and a dense patch of the
// black outline to all eighteen intended centers; the 81x71 windows stay disjoint in this grid. Measured
// local ink is 608..902 on Gl and 608..840 on Wgpu, leaving the threshold well below either backend.
// MEASURED defeat: swapping the first two fills preserved global ink but failed both backends at shape 0.
function assertOutlineLocations(frame: Readonly<Bitmap>): void {
  for (let i = 0; i < 18; i++) {
    const centerX = Math.round(frame.width * (0.12 + 0.18 * (i % 5)));
    const centerY = Math.round(frame.height * (0.18 + 0.2 * Math.floor(i / 5)));
    const actualFill = getBitmapPixelRgb(frame, centerX, centerY);
    const expectedFill = EXPECTED_FILL_RGB[i % EXPECTED_FILL_RGB.length]!;
    const fillDelta = Math.max(
      Math.abs(((actualFill >> 16) & 255) - ((expectedFill >> 16) & 255)),
      Math.abs(((actualFill >> 8) & 255) - ((expectedFill >> 8) & 255)),
      Math.abs((actualFill & 255) - (expectedFill & 255)),
    );
    if (fillDelta > 4) {
      throw new Error(
        `[effect-outline] shape ${i} center at (${centerX}, ${centerY}) is ` +
          `#${actualFill.toString(16).padStart(6, '0')} (expected #${expectedFill.toString(16).padStart(6, '0')})`,
      );
    }

    let localInk = 0;
    for (let y = centerY - 35; y <= centerY + 35; y++) {
      for (let x = centerX - 40; x <= centerX + 40; x++) {
        const rgb = getBitmapPixelRgb(frame, x, y);
        if (((rgb >> 16) & 255) < 8 && ((rgb >> 8) & 255) < 8 && (rgb & 255) < 8) localInk++;
      }
    }
    if (localInk < MIN_LOCAL_OUTLINE_INK) {
      throw new Error(
        `[effect-outline] shape ${i} has ${localInk} local black pixels (expected at least ` +
          `${MIN_LOCAL_OUTLINE_INK}) — its outline moved or disappeared`,
      );
    }
  }
}

function measureOutlineInk(frame: Readonly<Bitmap>): number {
  let ink = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const rgb = getBitmapPixelRgb(frame, x, y);
      if (((rgb >> 16) & 255) < 8 && ((rgb >> 8) & 255) < 8 && (rgb & 255) < 8) ink += 1;
    }
  }
  return ink / (frame.width * frame.height);
}
