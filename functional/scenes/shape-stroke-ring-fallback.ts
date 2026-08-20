// shape-stroke-ring-fallback — validates both outcomes of solid stroke mesh selection:
// a simple closed centerline becomes a hollow GPU ring, while a self-intersecting centerline uses
// the renderer's first-class Canvas raster fallback. The same display list runs on every backend.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeLineStyle,
  appendShapePath,
  appendShapeRectangle,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  PathCommand,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 400;
const HEIGHT = 260;
const STROKE = 12;

const RING_X = 45;
const RING_Y = 65;
const RING_W = 120;
const RING_H = 130;

const BOW_LEFT = 225;
const BOW_RIGHT = 355;
const BOW_TOP = 65;
const BOW_BOTTOM = 195;

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  expectedImageDescription:
    'On a 400×260 pure-black field, a hollow RGB(0,221,102) green 12-pixel outline is centered on a ' +
    '120×130 rectangle from (45,65) to (165,195), with 6 pixels of stroke on each side of its centerline. ' +
    'To its right, an RGB(255,51,68) red 12-pixel bow-tie centerline spans x=225–355 and y=65–195, crossing at (290,130), the midpoint of both ranges. Its triangular gaps remain black; neither figure has an interior fill or gradient.',
  kinds: [ShapeKind],
  strokePathTessellation: true,
});

const root = createDisplayObject();

const ring = createShape();
appendShapeLineStyle(ring, STROKE, 0x00dd66ff, 1);
appendShapeRectangle(ring, RING_X, RING_Y, RING_W, RING_H);
addNodeChild(root, ring);

const pathological = createShape();
appendShapeLineStyle(pathological, STROKE, 0xff3344ff, 1);
appendShapePath(
  pathological,
  [PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO, PathCommand.CLOSE],
  [BOW_LEFT, BOW_TOP, BOW_RIGHT, BOW_BOTTOM, BOW_LEFT, BOW_BOTTOM, BOW_RIGHT, BOW_TOP],
  'nonZero',
);
addNodeChild(root, pathological);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  const ringEdge = at(RING_X, RING_Y + RING_H / 2);
  if (!isGreen(ringEdge)) {
    throw new Error(`[shape-stroke-ring-fallback] ring edge expected green, got #${hex(ringEdge)}`);
  }

  const ringCenter = at(RING_X + RING_W / 2, RING_Y + RING_H / 2);
  if (!isBlack(ringCenter)) {
    throw new Error(`[shape-stroke-ring-fallback] ring center expected hollow, got #${hex(ringCenter)}`);
  }

  // Both diagonals cross here. A blank pixel proves the pathological null sentinel became a dropped
  // draw instead of the required raster fallback.
  const bowCrossing = at((BOW_LEFT + BOW_RIGHT) / 2, (BOW_TOP + BOW_BOTTOM) / 2);
  if (!isRed(bowCrossing)) {
    throw new Error(`[shape-stroke-ring-fallback] fallback crossing expected red, got #${hex(bowCrossing)}`);
  }

  const bowGap = at((BOW_LEFT + BOW_RIGHT) / 2, BOW_TOP + 25);
  if (!isBlack(bowGap)) {
    throw new Error(`[shape-stroke-ring-fallback] fallback gap expected background, got #${hex(bowGap)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function isGreen(rgb: number): boolean {
  return channel(rgb, 8) > 160 && channel(rgb, 16) < 90 && channel(rgb, 0) < 140;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 120 && channel(rgb, 0) < 130;
}

function isBlack(rgb: number): boolean {
  return channel(rgb, 16) < 30 && channel(rgb, 8) < 30 && channel(rgb, 0) < 30;
}

function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
