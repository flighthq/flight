// node-blend-modes-advanced — validates the SEPARABLE blend equations (Multiply, Screen) that only the
// Canvas (globalCompositeOperation) and DOM (CSS mix-blend-mode) backends implement. The webgl/webgpu
// backends express blending with fixed-function blend state and support only Normal/Layer + Add (every
// other mode falls back to Normal there), so this test is scoped to canvas+dom via package.json
// `renderers` — the cross-backend Add proof lives in node-blend-modes.
//
// Both overlays use the SAME mid-gray as the base, so the result is purely the blend equation:
//   Multiply(0.5, 0.5) = 0.25 → ~64   (darkens)
//   Screen(0.5, 0.5)   = 0.75 → ~192  (brightens)
// A backend that ignored the mode would leave both regions at the overlay's own gray (~128), failing.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  BlendMode,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const GRAY = 0x808080; // base AND overlay color; result is the blend equation alone (luma ≈ 128)
const BAND_X = 100;
const BAND_Y = 200;
const BAND_W = 600;
const BAND_H = 200;

const OVERLAY_Y = 240;
const OVERLAY_H = 120;
const OVERLAY_W = 180;

const MULTIPLY_X = 200; // Multiply(0.5,0.5) → ~64 (darken)
const SCREEN_X = 460; // Screen(0.5,0.5)   → ~192 (brighten)

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
  blend: true,
});

const root = createDisplayContainer();

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

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));
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
