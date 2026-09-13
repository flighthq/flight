// shape-ellipse-fill — validates ellipse fill rendering via appendShapeEllipse.
//
// Draws a yellow-filled ellipse with top-left at (100,100), width 200, height 100. The ellipse
// center is at (200,150). The scene assertion verifies:
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
const EX = 100;
const EY = 100;
const EW = 200;
const EH = 100;
const ECX = EX + EW / 2;
const ECY = EY + EH / 2;

declareAntialiasingPolicy('aa');

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  expectedImageDescription:
    'On a 400×300 pure-black field, one flat RGB(204,204,0) yellow ellipse is 200×100 pixels and spans ' +
    'x=100–300 and y=100–200. Its center is (200,150), derived as each starting coordinate plus half ' +
    'its dimension. It has no outline, gradient, or marks outside the smooth oval.',
  kinds: [ShapeKind],
});

const root = createDisplayObject();

const ellipse = createShape();
appendShapeBeginFill(ellipse, 0xcccc00ff, 1);
appendShapeEllipse(ellipse, EX, EY, EW, EH);
appendShapeEndFill(ellipse);
invalidateNodeAppearance(ellipse);
addNodeChild(root, ellipse);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const center = at(ECX, ECY);
  if (!isYellow(center)) {
    throw new Error(`[shape-ellipse-fill] center expected yellow, got #${hex(center)}`);
  }

  const nearHEdge = at(EX + EW - 10, ECY);
  if (!isYellow(nearHEdge)) {
    throw new Error(`[shape-ellipse-fill] near horizontal edge expected yellow, got #${hex(nearHEdge)}`);
  }

  const nearVEdge = at(ECX, EY + EH - 10);
  if (!isYellow(nearVEdge)) {
    throw new Error(`[shape-ellipse-fill] near vertical edge expected yellow, got #${hex(nearVEdge)}`);
  }

  const outside = at(EX + EW + 5, EY + EH + 5);
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
