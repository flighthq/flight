// node-alpha — validates source-over alpha blending of a semi-transparent display object onto the
// scene. A fully opaque blue square is drawn first; an opaque-colored red square with alpha 0.5 is drawn
// on top, partially overlapping it and partially extending over the bare background.
//
// Only a real render exercises the per-pixel blend: the red square's pixels are 50% red composited over
// whatever is beneath them. The oracle samples the bottom-only region (pure blue, untouched), the region
// where the half-alpha red sits over the black background (red channel ~half of 255), and an empty area
// (background). Passing requires the renderer to honour node alpha during compositing, not just paint a
// flat color.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const BOTTOM_X = 250;
const BOTTOM_Y = 200;
const TOP_X = 350;
const TOP_Y = 300;
const SQUARE = 200;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

// Bottom: fully opaque blue.
const bottom = createShape();
appendShapeBeginFill(bottom, 0x0000ff, 1);
appendShapeRectangle(bottom, BOTTOM_X, BOTTOM_Y, SQUARE, SQUARE);
appendShapeEndFill(bottom);
addNodeChild(root, bottom);

// Top: opaque-colored red, drawn at half node alpha so it blends source-over what is beneath it.
const top = createShape();
appendShapeBeginFill(top, 0xff0000, 1);
appendShapeRectangle(top, TOP_X, TOP_Y, SQUARE, SQUARE);
appendShapeEndFill(top);
top.alpha = 0.5;
invalidateNodeAppearance(top);
addNodeChild(root, top);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) Bottom-only region (top-left of the blue square, before the red overlaps) is pure blue.
  const bottomOnly = at(BOTTOM_X + 40, BOTTOM_Y + 40);
  if (channel(bottomOnly, 0) < 180 || channel(bottomOnly, 16) > 70 || channel(bottomOnly, 8) > 70) {
    throw new Error(`[node-alpha] bottom-only region not blue — got #${hex(bottomOnly)}`);
  }

  // 2) Top-over-background region (bottom-right of the red square, beyond the blue): half-alpha red over
  //    black ⇒ red channel ~half of 255 (≈110–150), green/blue near zero.
  const redOverBg = at(TOP_X + SQUARE - 40, TOP_Y + SQUARE - 40);
  const r = channel(redOverBg, 16);
  if (r < 95 || r > 165) {
    throw new Error(`[node-alpha] half-alpha red channel ${r} not in 95..165 — got #${hex(redOverBg)}`);
  }
  if (channel(redOverBg, 8) > 70 || channel(redOverBg, 0) > 70) {
    throw new Error(`[node-alpha] red-over-bg has unexpected green/blue — got #${hex(redOverBg)}`);
  }

  // 3) Empty area is background.
  const empty = at(700, 100);
  if (!isBackground(empty)) {
    throw new Error(`[node-alpha] empty area not background — got #${hex(empty)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
