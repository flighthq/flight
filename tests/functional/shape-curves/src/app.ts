// shape-curves — validates that curved path segments (cubic + quadratic Béziers) flatten and fill.
//
// This scene builds a smooth closed blob from Bézier curves: a circle approximated by four cubic
// segments (appendShapeCubicCurveTo), then dimpled at the top with a quadratic segment
// (appendShapeCurveTo) so both curve commands are exercised. It is filled with a solid color. The
// oracle proves the curved outline encloses a filled interior: the center samples the fill color,
// while a canvas corner well outside the blob stays background. This is visual — it depends on curve
// flattening and scan-fill of a non-rectangular region, which jsdom cannot rasterize.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEndFill,
  appendShapeMoveTo,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Blob centered here, approx radius R.
const CX = 400;
const CY = 300;
const R = 150;
// Cubic Bézier circle-arc control offset (kappa * radius) for a 90° arc.
const K = 0.5522847498 * R;

const FILL_COLOR = 0xff8800; // solid orange

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const blob = createShape();
appendShapeBeginFill(blob, FILL_COLOR, 1);
// Start at the right-most point and sweep clockwise with four cubic arcs back around to near the top,
// then close the top with a quadratic curve through a control point pulled toward the center (a dimple).
appendShapeMoveTo(blob, CX + R, CY);
// Right -> bottom
appendShapeCubicCurveTo(blob, CX + R, CY + K, CX + K, CY + R, CX, CY + R);
// Bottom -> left
appendShapeCubicCurveTo(blob, CX - K, CY + R, CX - R, CY + K, CX - R, CY);
// Left -> top
appendShapeCubicCurveTo(blob, CX - R, CY - K, CX - K, CY - R, CX, CY - R);
// Top -> right, but routed via a quadratic with a control point dimpling inward.
appendShapeCurveTo(blob, CX + K * 0.6, CY - K * 0.6, CX + R, CY);
appendShapeEndFill(blob);
addNodeChild(root, blob);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Center of the blob: solid fill color. (Slightly below center to stay clear of the top dimple.)
  const center = at(CX, CY + 30);
  if (!isFill(center)) {
    throw new Error(`[shape-curves] blob interior not fill color — got #${hex(center)}`);
  }

  // A canvas corner, far outside the blob: background.
  const corner = at(40, 40);
  if (!isBackground(corner)) {
    throw new Error(`[shape-curves] outside-blob corner not background — got #${hex(corner)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// Orange 0xff8800: high red, mid green, low blue.
function isFill(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) > 80 && channel(rgb, 8) < 200 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
