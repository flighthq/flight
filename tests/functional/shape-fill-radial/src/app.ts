// shape-fill-radial — validates RADIAL gradient fills, including the focalPointRatio that shifts the
// gradient's bright focal center off the geometric center. Two circles are filled with the same
// white→black radial ramp: circle A is centered (focalPointRatio 0), circle B has its focal point
// pushed toward one side (focalPointRatio 0.7).
//
// This is visual: it depends on the radial gradient-to-geometry mapping and per-pixel interpolation
// that only a real rasterizer produces. The oracle proves (1) circle A is radially symmetric — the
// four cardinal samples at half-radius have ~equal luma — and (2) circle B is asymmetric — the focal
// shift makes one side measurably brighter, so the same four samples are NOT all equal.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeEndFill,
  createDisplayContainer,
  createGradientTransformMatrix,
  createShape,
  getSurfacePixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Two circles of equal radius, side by side.
const RADIUS = 140;
const A_CX = 250; // centered focal point
const A_CY = 300;
const B_CX = 560; // off-center focal point
const B_CY = 300;

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

// createGradientTransformMatrix(width, height, rotation, tx, ty) maps the unit gradient box onto a box
// of the given size with origin (tx, ty). Passing the circle's bounding box (2*r square at cx-r, cy-r)
// makes the radial ramp's outer edge coincide with the circle's rim: center = ratio 0 (white), rim =
// ratio 255 (black).
function radialCircle(cx: number, cy: number, focalPointRatio: number): void {
  const shape = createShape();
  const matrix = createGradientTransformMatrix(2 * RADIUS, 2 * RADIUS, 0, cx - RADIUS, cy - RADIUS);
  appendShapeBeginGradientFill(
    shape,
    'radial',
    [0xffffff, 0x000000],
    [1, 1],
    [0, 255],
    matrix,
    'pad',
    'rgb',
    focalPointRatio,
  );
  appendShapeCircle(shape, cx, cy, RADIUS);
  appendShapeEndFill(shape);
  addNodeChild(root, shape);
}

radialCircle(A_CX, A_CY, 0); // centered: radially symmetric
radialCircle(B_CX, B_CY, 0.7); // focal pushed off-center: asymmetric

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Four cardinal points at half-radius from a circle's center.
  const half = RADIUS / 2;
  function cardinalLumas(cx: number, cy: number): readonly number[] {
    return [
      luma(at(cx + half, cy)), // right
      luma(at(cx - half, cy)), // left
      luma(at(cx, cy + half)), // bottom
      luma(at(cx, cy - half)), // top
    ];
  }

  // Circle A — centered focal: the four cardinal samples must be ~equal (radial symmetry).
  const a = cardinalLumas(A_CX, A_CY);
  const aSpread = Math.max(...a) - Math.min(...a);
  if (aSpread > 30) {
    throw new Error(
      `[shape-fill-radial] centered circle not radially symmetric — cardinal luma spread ${aSpread} (${a.join(', ')})`,
    );
  }

  // Circle B — off-center focal: the four cardinal samples must NOT all be equal (asymmetry). The focal
  // shift toward one side brightens that side, so the spread must clearly exceed circle A's symmetric
  // spread.
  const b = cardinalLumas(B_CX, B_CY);
  const bSpread = Math.max(...b) - Math.min(...b);
  if (bSpread < 60) {
    throw new Error(
      `[shape-fill-radial] off-center focal circle not asymmetric — cardinal luma spread ${bSpread} (${b.join(', ')})`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function luma(rgb: number): number {
  // White→black grayscale ramp: channels are roughly equal, so a simple average is robust.
  return (channel(rgb, 16) + channel(rgb, 8) + channel(rgb, 0)) / 3;
}
