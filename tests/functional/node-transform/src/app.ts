// node-transform — validates the 2D local transform pipeline: pivot + position + rotation compose into a
// node's world transform that the renderer actually applies to geometry.
//
// A filled square is given a pivot at its own center, positioned at screen center, and rotated 45°
// (rotation is in DEGREES in Flight). A pure data/unit test can check the matrix math, but only a real
// render proves the renderer rasterizes the rotated geometry. At 45° the square becomes a diamond whose
// footprint is the L1 ball |x-cx|+|y-cy| ≤ halfDiagonal: the four corners of the *axis-aligned* square
// fall OUTSIDE it, and four points just beyond the square's edges (which the axis-aligned square never
// covered) fall INSIDE it. The oracle checks all of these, so it can only pass for a genuine ~45°
// rotation about the pivot — a near-zero or wrong angle fails.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const FILL = 0x3399ff;

const SIDE = 160;
const HALF = SIDE / 2; // 80
const CENTER_X = 400;
const CENTER_Y = 300;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

// Local geometry: a SIDE×SIDE square with its top-left at the local origin. The pivot is the square's
// center, so setting rotation turns the square about its own middle, and (x, y) places that center.
const square = createShape();
appendShapeBeginFill(square, FILL, 1);
appendShapeRectangle(square, 0, 0, SIDE, SIDE);
appendShapeEndFill(square);
square.pivotX = HALF;
square.pivotY = HALF;
square.x = CENTER_X;
square.y = CENTER_Y;
square.rotation = 45; // DEGREES — turns the square into a diamond about its center
invalidateNodeLocalTransform(square);
addNodeChild(root, square);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) The center is unaffected by rotation — still fill.
  if (!isFill(at(CENTER_X, CENTER_Y))) {
    throw new Error(`[node-transform] center not fill color — got #${hex(at(CENTER_X, CENTER_Y))}`);
  }

  // 2) All four corners of the AXIS-ALIGNED square (±HALF, ±HALF from center) lie outside the 45° diamond
  //    (|dx|+|dy| = 160 ≫ halfDiagonal ≈ 113) — so a square that did NOT rotate would wrongly show fill.
  for (const [dx, dy] of [
    [-HALF, -HALF],
    [HALF, -HALF],
    [-HALF, HALF],
    [HALF, HALF],
  ]) {
    const rgb = at(CENTER_X + dx, CENTER_Y + dy);
    if (!isBackground(rgb)) {
      throw new Error(
        `[node-transform] axis-aligned corner (${dx},${dy}) should be outside the diamond — got #${hex(rgb)}`,
      );
    }
  }

  // 3) Four points 90px from center along the axes lie INSIDE the diamond (90 < 113) but BEYOND the
  //    axis-aligned square's edges (90 > HALF=80) — regions only a rotated square covers. A near-zero
  //    rotation leaves these as background.
  for (const [dx, dy] of [
    [0, -90],
    [0, 90],
    [-90, 0],
    [90, 0],
  ]) {
    const rgb = at(CENTER_X + dx, CENTER_Y + dy);
    if (!isFill(rgb)) {
      throw new Error(`[node-transform] diamond extreme (${dx},${dy}) not fill color — got #${hex(rgb)}`);
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isFill(rgb: number): boolean {
  // 0x3399ff: low red, mid green, high blue.
  return channel(rgb, 16) < 110 && channel(rgb, 8) > 100 && channel(rgb, 0) > 180;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
