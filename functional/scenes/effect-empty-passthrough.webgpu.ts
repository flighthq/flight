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
  getBitmapPixelRgb,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  defaultWgpuShapeRenderer,
  endWgpuRenderEffectPipeline,
  prepareScene2DRender,
  registerWgpuStandardMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuScene2D,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// Wgpu parity column for the empty-passthrough identity check. The scene renders through the effect
// pipeline with an EMPTY effect list at sampleCount 1; begin -> render -> end with no stages must
// present the scene unchanged, proving the Wgpu pipeline's present path is an identity blit.
declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a very dark background with four AXIS-ALIGNED square tiles of about 140 px — none of ' +
    'them rotated, all sitting square to the edges of the field: red centred near (224,180), green near ' +
    '(576,180), blue near (224,420) and yellow near (576,420). The picture is COMPLETELY UNTREATED — the tiles ' +
    'have hard clean edges, flat unmodified fill colours, no glow or spill past any edge, no darkening toward the ' +
    'corners, no banding and no blur. It must look exactly as the same four tiles would look drawn straight to ' +
    'the screen: any visible processing at all is the failure, because an empty effect list must change nothing. ' +
    'The very dark background is visible between and around all four.',
);
const BACKGROUND_COLOR = 0x101014ff;

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: BACKGROUND_COLOR });
registerRenderer(state, ShapeKind, defaultWgpuShapeRenderer);
registerWgpuStandardMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, { sampleCount: 1 });

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

registerWgpuFunctionalTarget(state, scale);

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline);
  renderWgpuScene2D(state, root);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

// Simple shapes on a neutral field. With an empty effect pipeline, the presented frame must match a
// plain direct render exactly — so these flat, axis-aligned shapes make any unintended tint, blur, or
// offset from the passthrough path easy to spot.

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const COLORS = [0xff5c5cff, 0x5cff5cff, 0x5c5cffff, 0xffff5cff];
for (let i = 0; i < COLORS.length; i++) {
  const shape = createShape();
  appendShapeBeginFill(shape, COLORS[i], 1);
  appendShapeRectangle(shape, -70, -70, 140, 140);
  appendShapeEndFill(shape);
  shape.x = logicalWidth * (0.28 + 0.44 * (i % 2));
  shape.y = logicalHeight * (0.3 + 0.4 * Math.floor(i / 2));
  addNodeChild(root, shape);
}

render(root);

// ★ READ OFF THE SOURCE: this scene draws four AXIS-ALIGNED filled rectangles of known colour on a flat
// field and hands the pipeline an EMPTY effects array. Axis-aligned edges produce no partial coverage,
// and an empty effect list must be an exact identity, so the finished frame can contain exactly five
// colours and no others — the four fills and the background.
//
// That makes the check total rather than sampled: every pixel is examined, and ANY sixth colour is a
// failure. A blur, a glow, a vignette, a tint, a resample or an accidental antialias each introduce an
// intermediate value on the first pixel they touch. Measured on all three backends today: exactly 5
// distinct colours in 480000 pixels.
//
// Both directions are checked on purpose. An unexpected colour means something processed the frame; a
// MISSING colour means a tile did not draw at all, which a "no unexpected colours" check alone would
// call clean on an empty screen.
const EXPECTED_COLORS = [...COLORS.map((rgba) => (rgba >>> 8) & 0xffffff), BACKGROUND_COLOR >>> 8];
const EXPECTED_TILE_PROBES = [
  [0.28, 0.3, 0xff5c5c],
  [0.72, 0.3, 0x5cff5c],
  [0.28, 0.7, 0x5c5cff],
  [0.72, 0.7, 0xffff5c],
] as const;

export function assertRender(frame: Readonly<Bitmap>): void {
  const seen = new Set<number>();
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      seen.add(getBitmapPixelRgb(frame, x, y) & 0xffffff);
    }
  }

  for (const color of seen) {
    if (!EXPECTED_COLORS.includes(color)) {
      throw new Error(
        `[effect-empty-passthrough] the frame contains #${color.toString(16).padStart(6, '0')}, which is ` +
          `neither a tile fill nor the background — an empty effect list must change nothing, so any ` +
          `intermediate value means the pipeline processed the picture`,
      );
    }
  }

  for (const color of EXPECTED_COLORS) {
    if (!seen.has(color)) {
      throw new Error(
        `[effect-empty-passthrough] #${color.toString(16).padStart(6, '0')} is absent from the frame — ` +
          `a tile or the background did not draw, which a check for unexpected colours alone would miss`,
      );
    }
  }

  // The exact colour set is intentionally total, but a set cannot distinguish where those colours
  // landed. These independently-authored centres make a tile permutation fail without weakening the
  // every-pixel identity check above.
  for (const [xFraction, yFraction, expected] of EXPECTED_TILE_PROBES) {
    const x = Math.round(frame.width * xFraction);
    const y = Math.round(frame.height * yFraction);
    const actual = getBitmapPixelRgb(frame, x, y) & 0xffffff;
    if (actual !== expected) {
      throw new Error(
        `[effect-empty-passthrough] tile centre (${x}, ${y}) is #${actual.toString(16).padStart(6, '0')}, ` +
          `expected #${expected.toString(16).padStart(6, '0')} — the empty pipeline preserved the palette ` +
          `but not the authored picture`,
      );
    }
  }
}
