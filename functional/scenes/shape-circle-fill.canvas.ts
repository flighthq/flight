// shape-circle-fill — validates circle fill rendering via appendShapeCircle.
//
// Draws two filled circles: a red circle centered at (150,150) with radius 80, and a blue circle
// centered at (350,150) with radius 60. The oracle verifies:
//   - the center of the red circle is red,
//   - the center of the blue circle is blue,
//   - a point outside both circles is background black,
//   - a point just inside the red circle's edge is red (verifying the radius is correct).
//
// Circle rendering involves arc-based path construction and triangulation — behavior that jsdom
// cannot verify visually.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 500;
const HEIGHT = 300;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const redCircle = createShape();
appendShapeBeginFill(redCircle, 0xff0000, 1);
appendShapeCircle(redCircle, 150, 150, 80);
appendShapeEndFill(redCircle);
invalidateNodeAppearance(redCircle);
addNodeChild(root, redCircle);

const blueCircle = createShape();
appendShapeBeginFill(blueCircle, 0x0000ff, 1);
appendShapeCircle(blueCircle, 350, 150, 60);
appendShapeEndFill(blueCircle);
invalidateNodeAppearance(blueCircle);
addNodeChild(root, blueCircle);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const redCenter = at(150, 150);
  if (!isRed(redCenter)) {
    throw new Error(`[shape-circle-fill] red circle center expected red, got #${hex(redCenter)}`);
  }

  const blueCenter = at(350, 150);
  if (!isBlue(blueCenter)) {
    throw new Error(`[shape-circle-fill] blue circle center expected blue, got #${hex(blueCenter)}`);
  }

  const redEdge = at(150 + 70, 150);
  if (!isRed(redEdge)) {
    throw new Error(`[shape-circle-fill] red circle near edge (220,150) expected red, got #${hex(redEdge)}`);
  }

  const outside = at(250, 20);
  if (!isBlack(outside)) {
    throw new Error(`[shape-circle-fill] outside point expected black, got #${hex(outside)}`);
  }
}

function isRed(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) > 180 && ((rgb >> 8) & 0xff) < 90 && (rgb & 0xff) < 90;
}
function isBlue(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 90 && ((rgb >> 8) & 0xff) < 90 && (rgb & 0xff) > 180;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
