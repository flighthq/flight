// Cross-backend blend parity fixture: every backend draws the same Normal control and Add probe.
// The wider WebGPU fixed-function state coverage lives in node-blend-modes-fixed.webgpu.ts so its
// backend-only grid is not incorrectly compared against this common layout.
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
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const BASE_GRAY = 0x808080ff;
const OVERLAY = 0x505050ff;
const BAND_X = 100;
const BAND_Y = 200;
const BAND_W = 600;
const BAND_H = 200;
const OVERLAY_Y = 240;
const OVERLAY_H = 120;
const OVERLAY_W = 180;
const NORMAL_X = 180;
const ADD_X = 440;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
  blend: true,
  expectedImageDescription:
    'On an opaque black field (800×600): a mid-gray (luma ~128) horizontal band spanning ' +
    'x 100–700, y 200–400. Inside the band, two dark-gray (luma ~80) overlay rectangles ' +
    '(180×120 each). The LEFT overlay at x 180, y 240 uses Normal blend — it paints opaquely, ' +
    'appearing darker than the base gray (luma ~80). The RIGHT overlay at x 440, y 240 uses ' +
    'Add blend — the overlay adds to the base, appearing brighter than the base gray ' +
    '(luma ~208). The Add region is markedly brighter than both the Normal region and the ' +
    'uncovered base. Both overlays use the same source color; only the blend equation differs.',
});

const root = createDisplayObject();
const base = createShape();
appendShapeBeginFill(base, BASE_GRAY, 1);
appendShapeRectangle(base, BAND_X, BAND_Y, BAND_W, BAND_H);
appendShapeEndFill(base);
addNodeChild(root, base);
addOverlay(NORMAL_X, BlendMode.Normal);
addOverlay(ADD_X, BlendMode.Add);
render(root);

function addOverlay(x: number, blendMode: BlendMode): void {
  const overlay = createShape();
  appendShapeBeginFill(overlay, OVERLAY, 1);
  appendShapeRectangle(overlay, x, OVERLAY_Y, OVERLAY_W, OVERLAY_H);
  appendShapeEndFill(overlay);
  overlay.blendMode = blendMode;
  invalidateNodeAppearance(overlay);
  addNodeChild(root, overlay);
}

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));
  const overlayCenterY = OVERLAY_Y + OVERLAY_H / 2;
  const baseLuma = luma(at(BAND_X + 20, BAND_Y + 20));
  if (baseLuma < 100 || baseLuma > 160) {
    throw new Error(`[node-blend-modes] base gray luma ${baseLuma.toFixed(0)} not near 128`);
  }
  const normalLuma = luma(at(NORMAL_X + OVERLAY_W / 2, overlayCenterY));
  if (normalLuma > baseLuma - 20) {
    throw new Error(
      `[node-blend-modes] Normal overlay luma ${normalLuma.toFixed(0)} not darker than base ${baseLuma.toFixed(0)}`,
    );
  }
  const addLuma = luma(at(ADD_X + OVERLAY_W / 2, overlayCenterY));
  if (addLuma < baseLuma + 40) {
    throw new Error(
      `[node-blend-modes] Add overlay luma ${addLuma.toFixed(0)} not brighter than base ${baseLuma.toFixed(0)}`,
    );
  }
  if (addLuma < normalLuma + 80) {
    throw new Error(
      `[node-blend-modes] Add (${addLuma.toFixed(0)}) not far brighter than Normal (${normalLuma.toFixed(0)}) for the same source color`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function luma(rgb: number): number {
  return 0.299 * channel(rgb, 16) + 0.587 * channel(rgb, 8) + 0.114 * channel(rgb, 0);
}
