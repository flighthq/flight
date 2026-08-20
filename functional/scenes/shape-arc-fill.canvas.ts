// shape-arc-fill — validates arc fill rendering via appendShapeArc.
//
// Draws a filled red quarter-circle arc (0 to PI/2) centered at (150,150) with radius 100.
// The arc is drawn as a pie slice by beginning at the center, arcing, then ending the fill.
// The scene assertion verifies:
//   - the center of the arc (where the pie meets) is red,
//   - a point along the arc's sweep (inside the filled region) is red,
//   - a point outside the arc sweep (in the opposite quadrant) is background black.
//
// Arc rendering exercises the Canvas arc() path construction, which jsdom cannot verify visually.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeArc,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineTo,
  appendShapeMoveTo,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 300;
const HEIGHT = 300;
const CX = 150;
const CY = 150;
const RADIUS = 100;

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  expectedImageDescription:
    'On a 300×300 pure-black field, a flat opaque pure-red quarter-disk starts at (150,150) and extends ' +
    'right and down to x=250 and y=250 (150 center + 100-pixel radius). The other three quadrants remain ' +
    'black; there is no outline or gradient.',
  kinds: [ShapeKind],
});

const root = createDisplayObject();

const arc = createShape();
appendShapeBeginFill(arc, 0xff0000ff, 1);
appendShapeMoveTo(arc, CX, CY);
appendShapeLineTo(arc, CX + RADIUS, CY);
appendShapeArc(arc, CX, CY, RADIUS, 0, Math.PI / 2);
appendShapeLineTo(arc, CX, CY);
appendShapeEndFill(arc);
invalidateNodeAppearance(arc);
addNodeChild(root, arc);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

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
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
