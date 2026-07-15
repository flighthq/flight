// node-z-order — validates that sibling display objects render in child-index order: a later child
// occludes an earlier one at the same position.
//
// Three overlapping filled rectangles are added in order: red, green, blue. Each is offset 40px
// right and 40px down. The oracle verifies:
//   - the blue rect's exclusive region is blue (last child, on top),
//   - the green rect's exclusive region is green (middle child),
//   - the red rect's exclusive region is red (first child, on bottom),
//   - at the overlap of all three, blue wins (last child).
//
// A renderer that drew in wrong order (e.g. first child on top) would fail the overlap check.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
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
const SIZE = 120;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const red = createShape();
appendShapeBeginFill(red, 0xff0000, 1);
appendShapeRectangle(red, 50, 50, SIZE, SIZE);
appendShapeEndFill(red);
invalidateNodeAppearance(red);
addNodeChild(root, red);

const green = createShape();
appendShapeBeginFill(green, 0x00ff00, 1);
appendShapeRectangle(green, 90, 90, SIZE, SIZE);
appendShapeEndFill(green);
invalidateNodeAppearance(green);
addNodeChild(root, green);

const blue = createShape();
appendShapeBeginFill(blue, 0x0000ff, 1);
appendShapeRectangle(blue, 130, 130, SIZE, SIZE);
appendShapeEndFill(blue);
invalidateNodeAppearance(blue);
addNodeChild(root, blue);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  if (!isRed(at(60, 60))) {
    throw new Error(`[node-z-order] red exclusive (60,60) expected red, got #${hex(at(60, 60))}`);
  }

  if (!isGreen(at(100, 100))) {
    throw new Error(`[node-z-order] green over red (100,100) expected green, got #${hex(at(100, 100))}`);
  }

  if (!isBlue(at(200, 200))) {
    throw new Error(`[node-z-order] blue exclusive (200,200) expected blue, got #${hex(at(200, 200))}`);
  }

  if (!isBlue(at(140, 140))) {
    throw new Error(
      `[node-z-order] overlap of all three (140,140) expected blue (last child), got #${hex(at(140, 140))}`,
    );
  }

  if (!isBlack(at(10, 10))) {
    throw new Error(`[node-z-order] outside (10,10) expected background, got #${hex(at(10, 10))}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function isGreen(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) > 180 && channel(rgb, 0) < 60;
}
function isBlue(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) > 180;
}
function isBlack(rgb: number): boolean {
  return channel(rgb, 16) < 30 && channel(rgb, 8) < 30 && channel(rgb, 0) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
