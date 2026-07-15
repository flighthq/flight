// shape-fill-stroke-combined — validates that a shape with both a solid fill and a visible stroke
// renders both layers correctly.
//
// Draws a rectangle at (80,80) 200x150 with a green fill and a thick (8px) red stroke. The oracle
// verifies:
//   - the interior center is green (fill present),
//   - a point on the stroke (at the top edge, outside the fill bounds) is red,
//   - a point outside both fill and stroke is background black.
//
// Fill+stroke composition is a rendering concern — the stroke must overlay correctly, and the
// stroke width must extend outside the fill bounds. This is inherently visual.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
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
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const shape = createShape();
appendShapeLineStyle(shape, STROKE, 0xff0000, 1);
appendShapeBeginFill(shape, 0x00cc00, 1);
appendShapeRectangle(shape, RX, RY, RW, RH);
appendShapeEndFill(shape);
invalidateNodeAppearance(shape);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const interior = at(RX + RW / 2, RY + RH / 2);
  if (!isGreen(interior)) {
    throw new Error(`[shape-fill-stroke-combined] interior expected green, got #${hex(interior)}`);
  }

  const strokeTop = at(RX + RW / 2, RY - STROKE / 2 + 1);
  if (!isRed(strokeTop)) {
    throw new Error(`[shape-fill-stroke-combined] stroke top expected red, got #${hex(strokeTop)}`);
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
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
