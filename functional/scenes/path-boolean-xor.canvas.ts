// path-boolean-xor — validates that a boolean XOR of two overlapping rectangular paths renders the
// symmetric difference: the non-overlapping portions of both rectangles are filled, while the
// overlapping region is empty.
//
// Two 100x100 rectangles overlap in a 50x50 region. XOR keeps only the parts exclusive to each
// input. The oracle verifies:
//   - a point exclusive to rect A (75,75) is filled (cyan),
//   - a point exclusive to rect B (175,175) is filled (cyan),
//   - the overlapping center (125,125) is background (XOR removes the intersection),
//   - a point outside both (25,25) is background.
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
  xorPaths,
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

const result = xorPaths(pathA, pathB);

const root = createDisplayContainer();
const shape = createShape();
appendShapeBeginFill(shape, 0x00cccc, 1);
appendShapePath(shape, result.commands, result.data, result.winding);
appendShapeEndFill(shape);
invalidateNodeAppearance(shape);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const exclusiveA = at(75, 75);
  const exclusiveB = at(175, 175);
  const overlap = at(125, 125);
  const outside = at(25, 25);

  if (!isCyan(exclusiveA)) {
    throw new Error(`[path-boolean-xor] rect A exclusive (75,75) expected cyan, got #${hex(exclusiveA)}`);
  }
  if (!isCyan(exclusiveB)) {
    throw new Error(`[path-boolean-xor] rect B exclusive (175,175) expected cyan, got #${hex(exclusiveB)}`);
  }
  if (!isBlack(overlap)) {
    throw new Error(`[path-boolean-xor] overlap (125,125) should be empty (XOR), got #${hex(overlap)}`);
  }
  if (!isBlack(outside)) {
    throw new Error(`[path-boolean-xor] outside (25,25) expected black, got #${hex(outside)}`);
  }
}

function isCyan(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 60 && ((rgb >> 8) & 0xff) > 150 && (rgb & 0xff) > 150;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
