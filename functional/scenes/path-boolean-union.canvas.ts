// path-boolean-union — validates that a boolean union of two overlapping rectangular paths renders
// correctly as a filled shape, covering the combined area of both inputs.
//
// Two axis-aligned rectangles are created as Paths: a red square (100x100 at 50,50) and a blue
// square (100x100 at 100,100), overlapping in a 50x50 region. Their union is rendered as a green
// filled shape. The oracle verifies:
//   - the overlapping center (125,125) is green (inside the union),
//   - a point exclusive to the first rect (75,75) is green (inside the union),
//   - a point exclusive to the second rect (175,175) is green (inside the union),
//   - a point outside both (25,25) is background black.
//
// This is inherently visual — it validates that the path-boolean operation produces a correct
// outline that renders the expected fill region, something jsdom cannot verify.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendPathRectangle,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapePath,
  createDisplayContainer,
  createPath,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
  unionPaths,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 300;
const HEIGHT = 300;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
});

const pathA = createPath();
appendPathRectangle(pathA, 50, 50, 100, 100);

const pathB = createPath();
appendPathRectangle(pathB, 100, 100, 100, 100);

const result = unionPaths(pathA, pathB);

const root = createDisplayContainer();
const shape = createShape();
appendShapeBeginFill(shape, 0x00cc00, 1);
appendShapePath(shape, result.commands, result.data, result.winding);
appendShapeEndFill(shape);
invalidateNodeAppearance(shape);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const overlap = at(125, 125);
  const exclusiveA = at(75, 75);
  const exclusiveB = at(175, 175);
  const outside = at(25, 25);

  if (!isGreen(overlap)) {
    throw new Error(`[path-boolean-union] overlap center (125,125) expected green, got #${hex(overlap)}`);
  }
  if (!isGreen(exclusiveA)) {
    throw new Error(`[path-boolean-union] rect A exclusive (75,75) expected green, got #${hex(exclusiveA)}`);
  }
  if (!isGreen(exclusiveB)) {
    throw new Error(`[path-boolean-union] rect B exclusive (175,175) expected green, got #${hex(exclusiveB)}`);
  }
  if (!isBlack(outside)) {
    throw new Error(`[path-boolean-union] outside (25,25) expected black, got #${hex(outside)}`);
  }
}

function isGreen(rgb: number): boolean {
  return ((rgb >> 8) & 0xff) > 150 && ((rgb >> 16) & 0xff) < 90 && (rgb & 0xff) < 90;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
