// shape-round-rect — validates round-rectangle fill rendering via appendShapeRoundRectangle.
//
// Draws a cyan-filled round rectangle at (50,50) with width 300, height 200, and ellipse
// dimensions 40x40. The oracle verifies:
//   - the center of the round rect is cyan,
//   - a point near the flat top edge (inside) is cyan,
//   - a point in the corner region (outside the rounded corner, inside the bounding box) is
//     background black — proving the corners are actually rounded, not square.
//
// Round-rectangle rendering uses the Canvas roundRect() API or a rect fallback. The corner
// rounding behavior is inherently visual.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRoundRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 400;
const HEIGHT = 300;
const RX = 50;
const RY = 50;
const RW = 300;
const RH = 200;
const ELLIPSE = 40;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const roundRect = createShape();
appendShapeBeginFill(roundRect, 0x00cccc, 1);
appendShapeRoundRectangle(roundRect, RX, RY, RW, RH, ELLIPSE, ELLIPSE);
appendShapeEndFill(roundRect);
invalidateNodeAppearance(roundRect);
addNodeChild(root, roundRect);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const center = at(RX + RW / 2, RY + RH / 2);
  if (!isCyan(center)) {
    throw new Error(`[shape-round-rect] center expected cyan, got #${hex(center)}`);
  }

  const topEdge = at(RX + RW / 2, RY + 5);
  if (!isCyan(topEdge)) {
    throw new Error(`[shape-round-rect] top edge expected cyan, got #${hex(topEdge)}`);
  }

  const cornerOutside = at(RX + 2, RY + 2);
  if (!isBlack(cornerOutside)) {
    throw new Error(`[shape-round-rect] corner outside expected black (rounded), got #${hex(cornerOutside)}`);
  }
}

function isCyan(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 90 && ((rgb >> 8) & 0xff) > 150 && (rgb & 0xff) > 150;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
