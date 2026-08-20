// node-blend-modes-advanced — validates the Canvas/DOM realization of the separable Multiply and Screen
// equations. GPU backends realize the same fixed modes through immutable blend state; their dedicated
// raster coverage lives in node-blend-modes.webgpu (WebGPU) and the WebGL blend suite.
//
// Both overlays use the SAME mid-gray as the base, so the result is purely the blend equation:
//   Multiply(0.5, 0.5) = 0.25 → ~64   (darkens)
//   Screen(0.5, 0.5)   = 0.75 → ~192  (brightens)
// A backend that ignored the mode would leave both regions at the overlay's own gray (~128), failing.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  BlendMode,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const GRAY = 0x808080ff; // base AND overlay color; result is the blend equation alone (luma ≈ 128)
const BAND_X = 100;
const BAND_Y = 200;
const BAND_W = 600;
const BAND_H = 200;

const OVERLAY_Y = 240;
const OVERLAY_H = 120;
const OVERLAY_W = 180;

const MULTIPLY_X = 200; // Multiply(0.5,0.5) → ~64 (darken)
const SCREEN_X = 460; // Screen(0.5,0.5)   → ~192 (brighten)

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
  blend: true,
  expectedImageDescription:
    'On an opaque black field (800×600): a mid-gray (luma ~128) horizontal band spanning ' +
    'x 100–700, y 200–400. Inside the band, two mid-gray overlay rectangles (180×120 each) ' +
    'using the same gray as the base. The LEFT overlay at x 200, y 240 uses Multiply blend — ' +
    'Multiply(0.5, 0.5) darkens it to luma ~64, visibly darker than the surrounding base. ' +
    'The RIGHT overlay at x 460, y 240 uses Screen blend — Screen(0.5, 0.5) brightens it to ' +
    'luma ~192, visibly brighter than the base. The Multiply region is notably darker and the ' +
    'Screen region notably brighter than the uncovered mid-gray base between them.',
});

const root = createDisplayObject();

const base = createShape();
appendShapeBeginFill(base, GRAY, 1);
appendShapeRectangle(base, BAND_X, BAND_Y, BAND_W, BAND_H);
appendShapeEndFill(base);
addNodeChild(root, base);

addOverlay(MULTIPLY_X, BlendMode.Multiply);
addOverlay(SCREEN_X, BlendMode.Screen);

render(root);

function addOverlay(x: number, blendMode: BlendMode): void {
  const overlay = createShape();
  appendShapeBeginFill(overlay, GRAY, 1);
  appendShapeRectangle(overlay, x, OVERLAY_Y, OVERLAY_W, OVERLAY_H);
  appendShapeEndFill(overlay);
  overlay.blendMode = blendMode;
  invalidateNodeAppearance(overlay);
  addNodeChild(root, overlay);
}

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));
  const cy = OVERLAY_Y + OVERLAY_H / 2;

  // Multiply darkens gray-on-gray toward ~64.
  const mul = luma(at(MULTIPLY_X + OVERLAY_W / 2, cy));
  if (mul < 30 || mul > 100) {
    throw new Error(`[node-blend-modes-advanced] Multiply(gray,gray) luma ${mul.toFixed(0)} not near 64`);
  }

  // Screen brightens gray-on-gray toward ~192.
  const scr = luma(at(SCREEN_X + OVERLAY_W / 2, cy));
  if (scr < 160 || scr > 224) {
    throw new Error(`[node-blend-modes-advanced] Screen(gray,gray) luma ${scr.toFixed(0)} not near 192`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function luma(rgb: number): number {
  return 0.299 * channel(rgb, 16) + 0.587 * channel(rgb, 8) + 0.114 * channel(rgb, 0);
}
