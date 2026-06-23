// shape-stroke-caps — validates the three line-cap styles ('none'/'round'/'square') on a thick stroke.
// Three identical horizontal white segments (thickness 20) are stacked vertically, differing only in
// their caps style. The cap controls how the stroke terminates at its endpoint:
//   - 'none'   (butt): the stroke stops flush at the geometric endpoint — nothing past it.
//   - 'square': a half-thickness rectangular extension past the endpoint — fills the bbox corner.
//   - 'round':  a half-thickness semicircular extension — covers the centerline past the end, but the
//               bounding-box corner falls outside the disc.
//
// This is visual: caps are extra geometry generated only at stroke ends by a real rasterizer. The
// oracle separates all three by sampling just past the endpoint on the centerline (none=bg, square &
// round=white) and at the bbox corner just past the end (square=white, round=bg).
import type { Surface } from '@flighthq/sdk';
import type { CapsStyle } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const THICKNESS = 20;
const HALF = THICKNESS / 2; // = 10, the cap extension distance for round/square
const SEG_X0 = 250;
const SEG_X1 = 550; // shared geometric endpoint x for all three segments

// Three rows, well separated vertically so caps never overlap a neighbor.
const ROW_NONE_Y = 160;
const ROW_ROUND_Y = 320;
const ROW_SQUARE_Y = 480;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

function segment(y: number, caps: CapsStyle): void {
  const shape = createShape();
  appendShapeLineStyle(shape, THICKNESS, 0xffffff, 1, false, 'normal', caps, 'round', 3);
  appendShapeMoveTo(shape, SEG_X0, y);
  appendShapeLineTo(shape, SEG_X1, y);
  addNodeChild(root, shape);
}

segment(ROW_NONE_Y, 'none');
segment(ROW_ROUND_Y, 'round');
segment(ROW_SQUARE_Y, 'square');

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Centerline samples: well inside the segment must be white for all three (proves the stroke drew).
  for (const [label, y] of [
    ['none', ROW_NONE_Y],
    ['round', ROW_ROUND_Y],
    ['square', ROW_SQUARE_Y],
  ] as const) {
    const mid = at((SEG_X0 + SEG_X1) / 2, y);
    if (!isWhite(mid)) {
      throw new Error(`[shape-stroke-caps] ${label} segment body not white — got #${hex(mid)}`);
    }
  }

  // Just BEYOND the geometric end on the centerline (x = SEG_X1 + 6, inside the HALF=10 cap extent).
  const beyondX = SEG_X1 + 6;
  const noneBeyond = at(beyondX, ROW_NONE_Y);
  if (!isBackground(noneBeyond)) {
    throw new Error(`[shape-stroke-caps] 'none' cap extends past endpoint — got #${hex(noneBeyond)} (expected bg)`);
  }
  const roundBeyond = at(beyondX, ROW_ROUND_Y);
  if (!isWhite(roundBeyond)) {
    throw new Error(
      `[shape-stroke-caps] 'round' cap missing past endpoint — got #${hex(roundBeyond)} (expected white)`,
    );
  }
  const squareBeyond = at(beyondX, ROW_SQUARE_Y);
  if (!isWhite(squareBeyond)) {
    throw new Error(
      `[shape-stroke-caps] 'square' cap missing past endpoint — got #${hex(squareBeyond)} (expected white)`,
    );
  }

  // Bounding-box CORNER just past the end (x = SEG_X1 + 8, y = center − 9). Both x and y offsets sit
  // inside the HALF=10 cap extent, so this is the square cap's corner. The square cap fills it (white);
  // the round cap's disc does not reach the corner (distance √(8²+9²)≈12 > 10) → background.
  const cornerX = SEG_X1 + 8;
  const squareCorner = at(cornerX, ROW_SQUARE_Y - 9);
  if (!isWhite(squareCorner)) {
    throw new Error(`[shape-stroke-caps] 'square' cap corner not filled — got #${hex(squareCorner)} (expected white)`);
  }
  const roundCorner = at(cornerX, ROW_ROUND_Y - 9);
  if (!isBackground(roundCorner)) {
    throw new Error(`[shape-stroke-caps] 'round' cap corner filled — got #${hex(roundCorner)} (expected bg)`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
