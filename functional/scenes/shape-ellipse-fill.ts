// shape-ellipse-fill — validates ellipse fill rendering via appendShapeEllipse.
//
// Draws a yellow-filled ellipse centered at (200,150) with horizontal radius 100 and vertical radius 50.
// The scene assertion verifies:
//   - the center of the ellipse is yellow,
//   - a point near the horizontal edge (inside) is yellow,
//   - a point near the vertical edge (inside) is yellow,
//   - a point outside the ellipse (corner of the bounding box) is background black.
//
// Ellipse rendering exercises the arc-based path construction path distinct from circles —
// behavior jsdom cannot verify visually.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEllipse,
  appendShapeEndFill,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 400;
const HEIGHT = 300;
const CENTER_X = 200;
const CENTER_Y = 150;
const RADIUS_X = 100;
const RADIUS_Y = 50;

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  expectedImageDescription:
    'On a 400×300 pure-black field, one flat RGB(204,204,0) yellow ellipse is 200×100 pixels and spans ' +
    'x=100–300 and y=100–200. Its center is (200,150), with horizontal radius 100 and vertical radius 50. ' +
    'It has no outline, gradient, or marks outside the smooth oval.',
  kinds: [ShapeKind],
});

const root = createDisplayObject();

const ellipse = createShape();
appendShapeBeginFill(ellipse, 0xcccc00ff, 1);
appendShapeEllipse(ellipse, CENTER_X, CENTER_Y, RADIUS_X, RADIUS_Y);
appendShapeEndFill(ellipse);
invalidateNodeAppearance(ellipse);
addNodeChild(root, ellipse);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const center = at(CENTER_X, CENTER_Y);
  if (!isYellow(center)) {
    throw new Error(`[shape-ellipse-fill] center expected yellow, got #${hex(center)}`);
  }

  const nearHEdge = at(CENTER_X + RADIUS_X - 10, CENTER_Y);
  if (!isYellow(nearHEdge)) {
    throw new Error(`[shape-ellipse-fill] near horizontal edge expected yellow, got #${hex(nearHEdge)}`);
  }

  const nearVEdge = at(CENTER_X, CENTER_Y + RADIUS_Y - 10);
  if (!isYellow(nearVEdge)) {
    throw new Error(`[shape-ellipse-fill] near vertical edge expected yellow, got #${hex(nearVEdge)}`);
  }

  const outside = at(CENTER_X + RADIUS_X + 5, CENTER_Y + RADIUS_Y + 5);
  if (!isBlack(outside)) {
    throw new Error(`[shape-ellipse-fill] corner outside ellipse expected black, got #${hex(outside)}`);
  }
}

function isYellow(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) > 150 && ((rgb >> 8) & 0xff) > 150 && (rgb & 0xff) < 90;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
