// shape-fill-gradient — validates linear gradient fills mapped through a gradient transform matrix.
//
// A gradient fill samples a color ramp across a region defined by a Matrix. This scene fills a single
// rectangle with a horizontal black→white linear gradient, with a transform that stretches the unit
// gradient box to span the rectangle's width (left = black, right = white). The oracle proves the ramp
// is oriented and monotonic: a sample near the left interior edge is dark (low luma), a sample near the
// right interior edge is bright (high luma), and right luma exceeds left luma by a wide margin. This is
// visual: it depends on the gradient-to-geometry mapping and per-pixel interpolation that only a real
// rasterizer produces.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginGradientFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayObject,
  createGradientTransformMatrix,
  createShape,
  getBitmapPixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// The gradient-filled rectangle.
const RECT_X = 150;
const RECT_Y = 180;
const RECT_W = 500;
const RECT_H = 240;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  expectedImageDescription:
    'On an 800×600 pure-black field, a 500×240 rectangle starts at (150,180), so its far edges are ' +
    'x=650 and y=420 (start + size). Its interior is a smooth grayscale ramp from pure black at the left ' +
    'edge to pure white at the right, with the same tone down each vertical slice. There is no outline, color tint, or abrupt band.',
  kinds: [ShapeKind],
});

const root = createDisplayObject();

const rect = createShape();
// createGradientTransformMatrix(width, height, rotation, tx, ty) maps the unit gradient box onto a
// box of the given size centered at (tx + width/2, ty + height/2). Passing the rect's own size and
// origin centers and stretches the horizontal ramp across the full rect width: left edge = ratio 0
// (black), right edge = ratio 255 (white).
const gradientMatrix = createGradientTransformMatrix(RECT_W, RECT_H, 0, RECT_X, RECT_Y);
appendShapeBeginGradientFill(rect, 'linear', [0x000000ff, 0xffffffff], [1, 1], [0, 255], gradientMatrix);
appendShapeRectangle(rect, RECT_X, RECT_Y, RECT_W, RECT_H);
appendShapeEndFill(rect);
addNodeChild(root, rect);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Comfortable margins inside the rect, sampled along the vertical center to avoid edge antialiasing.
  const midY = RECT_Y + RECT_H / 2;
  const leftRgb = at(RECT_X + 40, midY);
  const rightRgb = at(RECT_X + RECT_W - 40, midY);

  const leftLuma = luma(leftRgb);
  const rightLuma = luma(rightRgb);

  // Left interior should be dark.
  if (leftLuma > 120) {
    throw new Error(`[shape-fill-gradient] left interior not dark — luma ${leftLuma} (#${hex(leftRgb)})`);
  }
  // Right interior should be bright.
  if (rightLuma < 150) {
    throw new Error(`[shape-fill-gradient] right interior not bright — luma ${rightLuma} (#${hex(rightRgb)})`);
  }
  // The ramp must brighten left→right by a wide margin (proves orientation + monotonicity).
  if (rightLuma <= leftLuma + 60) {
    throw new Error(`[shape-fill-gradient] gradient not brightening left→right — left ${leftLuma}, right ${rightLuma}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function luma(rgb: number): number {
  // Black→white grayscale ramp: every channel is roughly equal, so a simple average is robust.
  return (channel(rgb, 16) + channel(rgb, 8) + channel(rgb, 0)) / 3;
}
function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
