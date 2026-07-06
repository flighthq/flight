// shape-fill-solid — validates solid-fill rasterization and z-order compositing of overlapping Shapes.
//
// Solid fills are the most fundamental Shape rendering path. This scene draws three opaque filled
// rectangles: a red and a green that overlap, and a separate blue. The oracle proves (1) each shape's
// non-overlapping interior renders its own color, (2) the overlap region shows the TOP shape's color
// (added last in z-order), and (3) untouched canvas remains the opaque-black background. This is
// inherently visual — it depends on fill coverage and the painter's-algorithm draw order, which jsdom
// unit tests cannot exercise.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Red rectangle.
const RED_X = 120;
const RED_Y = 120;
const RED_W = 240;
const RED_H = 240;

// Green rectangle — overlaps the red one in its bottom-right corner.
const GREEN_X = 280;
const GREEN_Y = 280;
const GREEN_W = 240;
const GREEN_H = 240;

// Blue rectangle — fully separate, in the right region of the canvas.
const BLUE_X = 580;
const BLUE_Y = 120;
const BLUE_W = 180;
const BLUE_H = 180;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

// Draw order (bottom to top): red, then green (so green wins the overlap), then blue.
const red = createShape();
appendShapeBeginFill(red, 0xff0000, 1);
appendShapeRectangle(red, RED_X, RED_Y, RED_W, RED_H);
appendShapeEndFill(red);
addNodeChild(root, red);

const green = createShape();
appendShapeBeginFill(green, 0x00ff00, 1);
appendShapeRectangle(green, GREEN_X, GREEN_Y, GREEN_W, GREEN_H);
appendShapeEndFill(green);
addNodeChild(root, green);

const blue = createShape();
appendShapeBeginFill(blue, 0x0000ff, 1);
appendShapeRectangle(blue, BLUE_X, BLUE_Y, BLUE_W, BLUE_H);
appendShapeEndFill(blue);
addNodeChild(root, blue);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Red's non-overlapping region: upper-left quadrant of the red rect (clear of the green overlap).
  const redOnly = at(RED_X + 60, RED_Y + 60);
  if (!isRed(redOnly)) {
    throw new Error(`[shape-fill-solid] red-only region not red — got #${hex(redOnly)}`);
  }

  // Green's non-overlapping region: lower-right quadrant of the green rect (clear of the red overlap).
  const greenOnly = at(GREEN_X + GREEN_W - 60, GREEN_Y + GREEN_H - 60);
  if (!isGreen(greenOnly)) {
    throw new Error(`[shape-fill-solid] green-only region not green — got #${hex(greenOnly)}`);
  }

  // Blue's interior (separate shape).
  const blueOnly = at(BLUE_X + BLUE_W / 2, BLUE_Y + BLUE_H / 2);
  if (!isBlue(blueOnly)) {
    throw new Error(`[shape-fill-solid] blue region not blue — got #${hex(blueOnly)}`);
  }

  // Overlap region (red ∩ green) — green is on top, so it must read green, not red.
  const overlap = at(GREEN_X + 60, GREEN_Y + 60);
  if (!isGreen(overlap)) {
    throw new Error(`[shape-fill-solid] overlap not top-shape (green) — got #${hex(overlap)}`);
  }

  // Empty canvas area: background (all channels low).
  const empty = at(700, 500);
  if (!isBackground(empty)) {
    throw new Error(`[shape-fill-solid] empty area not background — got #${hex(empty)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 90 && channel(rgb, 8) > 180 && channel(rgb, 0) < 90;
}
function isBlue(rgb: number): boolean {
  return channel(rgb, 16) < 90 && channel(rgb, 8) < 90 && channel(rgb, 0) > 180;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
