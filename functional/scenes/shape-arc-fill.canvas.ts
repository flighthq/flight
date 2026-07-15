// shape-arc-fill — validates arc fill rendering via appendShapeArc.
//
// Draws a filled red quarter-circle arc (0 to PI/2) centered at (150,150) with radius 100.
// The arc is drawn as a pie slice by beginning at the center, arcing, then ending the fill.
// The oracle verifies:
//   - the center of the arc (where the pie meets) is red,
//   - a point along the arc's sweep (inside the filled region) is red,
//   - a point outside the arc sweep (in the opposite quadrant) is background black.
//
// Arc rendering exercises the Canvas arc() path construction, which jsdom cannot verify visually.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeArc,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineTo,
  appendShapeMoveTo,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 300;
const HEIGHT = 300;
const CX = 150;
const CY = 150;
const RADIUS = 100;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const arc = createShape();
appendShapeBeginFill(arc, 0xff0000, 1);
appendShapeMoveTo(arc, CX, CY);
appendShapeLineTo(arc, CX + RADIUS, CY);
appendShapeArc(arc, CX, CY, RADIUS, 0, Math.PI / 2);
appendShapeLineTo(arc, CX, CY);
appendShapeEndFill(arc);
invalidateNodeAppearance(arc);
addNodeChild(root, arc);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const insideArc = at(CX + 40, CY + 40);
  if (!isRed(insideArc)) {
    throw new Error(`[shape-arc-fill] inside arc expected red, got #${hex(insideArc)}`);
  }

  const nearEdge = at(CX + 70, CY + 10);
  if (!isRed(nearEdge)) {
    throw new Error(`[shape-arc-fill] near right edge expected red, got #${hex(nearEdge)}`);
  }

  const outsideArc = at(CX - 50, CY - 50);
  if (!isBlack(outsideArc)) {
    throw new Error(`[shape-arc-fill] outside arc expected black, got #${hex(outsideArc)}`);
  }
}

function isRed(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) > 180 && ((rgb >> 8) & 0xff) < 90 && (rgb & 0xff) < 90;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
