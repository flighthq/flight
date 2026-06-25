// shape-stroke — validates Shape line styles (stroke without fill): a thick stroked line carries its
// color at full thickness, and an unfilled stroked rectangle draws its outline only (hollow interior).
//
// Strokes are a core Shape pipeline path with NO prior functional coverage. The scene draws two stroked
// shapes on an opaque background; the oracle proves (1) the thick line is its color at the centerline and
// background a thickness away — i.e. the stroke has real width — and (2) the rectangle's edge is its
// color while its interior is background — i.e. lineStyle strokes the outline without filling it.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// A horizontal white stroke, thickness 24, centered vertically at LINE_Y.
const LINE_X0 = 150;
const LINE_X1 = 650;
const LINE_Y = 200;
const LINE_THICKNESS = 24;

// A hollow red rectangle (stroke only, no fill), thickness 10.
const RECT_X = 250;
const RECT_Y = 320;
const RECT_W = 300;
const RECT_H = 180;
const RECT_THICKNESS = 10;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const line = createShape();
appendShapeLineStyle(line, LINE_THICKNESS, 0xffffff, 1);
appendShapeMoveTo(line, LINE_X0, LINE_Y);
appendShapeLineTo(line, LINE_X1, LINE_Y);
addNodeChild(root, line);

const rect = createShape();
appendShapeLineStyle(rect, RECT_THICKNESS, 0xff0000, 1);
// No beginFill: lineStyle draws the rectangle's outline only.
appendShapeRectangle(rect, RECT_X, RECT_Y, RECT_W, RECT_H);
addNodeChild(root, rect);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) The thick line is white along its centerline.
  const lineMid = at((LINE_X0 + LINE_X1) / 2, LINE_Y);
  if (!isWhite(lineMid)) {
    throw new Error(`[shape-stroke] line centerline not white — got #${hex(lineMid)}`);
  }
  // ...and background well outside the stroke band (proves the stroke has finite width, not a fill).
  const offLine = at((LINE_X0 + LINE_X1) / 2, LINE_Y + LINE_THICKNESS);
  if (!isBackground(offLine)) {
    throw new Error(`[shape-stroke] pixel a full thickness off the line not background — got #${hex(offLine)}`);
  }

  // 2) The rectangle's left edge is red...
  const edge = at(RECT_X, RECT_Y + RECT_H / 2);
  if (!isRed(edge)) {
    throw new Error(`[shape-stroke] rectangle left edge not red — got #${hex(edge)}`);
  }
  // ...and its interior is background (stroke-only, no fill).
  const interior = at(RECT_X + RECT_W / 2, RECT_Y + RECT_H / 2);
  if (!isBackground(interior)) {
    throw new Error(`[shape-stroke] rectangle interior not hollow — got #${hex(interior)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
