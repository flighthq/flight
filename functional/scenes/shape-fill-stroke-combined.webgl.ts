// shape-fill-stroke-combined — validates that WebGL composes a solid fill and open solid stroke from
// one Shape as resolution-independent GPU meshes. The open line isolates this composition vertical
// from closed-ring tessellation, which is covered separately.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  createDisplayObject,
  createShape,
  getBitmapPixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 400;
const HEIGHT = 300;
const RX = 80;
const RY = 80;
const RW = 200;
const RH = 150;
const STROKE = 8;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  expectedImageDescription:
    'On a 400×300 pure-black field, a flat RGB(0,204,0) green 200×150 rectangle starts at (80,80), ' +
    'so its far edges are x=280 and y=230. A separate 8-pixel pure-red band runs across x=80–280 and ' +
    'y=72–80: its center is y=76 (80 − 8/2), with 4 pixels on each side. The other three rectangle edges have no outline, and there is no gradient or blend.',
  kinds: [ShapeKind],
});

const root = createDisplayObject();

const shape = createShape();
appendShapeBeginFill(shape, 0x00cc00ff, 1);
appendShapeRectangle(shape, RX, RY, RW, RH);
appendShapeEndFill(shape);
appendShapeLineStyle(shape, STROKE, 0xff0000ff, 1);
appendShapeMoveTo(shape, RX, RY - STROKE / 2);
appendShapeLineTo(shape, RX + RW, RY - STROKE / 2);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const interior = at(RX + RW / 2, RY + RH / 2);
  if (!isGreen(interior)) {
    throw new Error(`[shape-fill-stroke-combined] interior expected green, got #${hex(interior)}`);
  }

  const strokeTop = at(RX + RW / 2, RY - STROKE / 2);
  if (!isRed(strokeTop)) {
    throw new Error(`[shape-fill-stroke-combined] open stroke expected red, got #${hex(strokeTop)}`);
  }

  const outside = at(20, 20);
  if (!isBlack(outside)) {
    throw new Error(`[shape-fill-stroke-combined] outside expected black, got #${hex(outside)}`);
  }
}

function isGreen(rgb: number): boolean {
  return ((rgb >> 8) & 0xff) > 150 && ((rgb >> 16) & 0xff) < 90 && (rgb & 0xff) < 90;
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
