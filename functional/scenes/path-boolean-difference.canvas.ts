// path-boolean-difference — validates that a boolean difference (A minus B) of two overlapping
// rectangular paths renders correctly, covering only the part of A that does not overlap B.
//
// Rect A is 100x100 at (50,50), rect B is 100x100 at (100,100). The difference A−B removes the
// overlap region (100,100)−(150,150) from A, leaving an L-shaped region. The oracle verifies:
//   - a point exclusive to A (75,75) is orange (inside the difference),
//   - the overlap center (125,125) is background black (subtracted out),
//   - a point exclusive to B (175,175) is background black (not in A at all),
//   - a point outside both (25,25) is background black.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendPathRectangle,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapePath,
  createDisplayObject,
  createPath,
  createShape,
  differencePaths,
  getBitmapPixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 250;
const HEIGHT = 250;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff,
  kinds: [ShapeKind],
  expectedImageDescription:
    'On an opaque black field (250×250): an orange L-shaped region — rectangle A ' +
    '(50,50)–(150,150) with its bottom-right 50×50 overlap against rectangle B removed. The ' +
    'filled area covers the top strip (50,50)–(150,100) and the left strip (50,100)–(100,150). ' +
    "The overlap zone (100,100)–(150,150) is black (subtracted). Rectangle B's exclusive area " +
    '(150,100)–(200,200) is black (never in A). No gradient, no stroke — a single flat orange.',
});

const pathA = createPath();
appendPathRectangle(pathA, 50, 50, 100, 100);

const pathB = createPath();
appendPathRectangle(pathB, 100, 100, 100, 100);

const result = differencePaths(pathA, pathB);

const root = createDisplayObject();
const shape = createShape();
appendShapeBeginFill(shape, 0xcc6600ff, 1);
appendShapePath(shape, result.commands, result.data, result.winding);
appendShapeEndFill(shape);
invalidateNodeAppearance(shape);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const exclusiveA = at(75, 75);
  if (!isOrange(exclusiveA)) {
    throw new Error(`[path-boolean-difference] exclusive A (75,75) expected orange, got #${hex(exclusiveA)}`);
  }

  const overlap = at(125, 125);
  if (!isBlack(overlap)) {
    throw new Error(`[path-boolean-difference] overlap (125,125) expected black, got #${hex(overlap)}`);
  }

  const exclusiveB = at(175, 175);
  if (!isBlack(exclusiveB)) {
    throw new Error(`[path-boolean-difference] exclusive B (175,175) expected black, got #${hex(exclusiveB)}`);
  }

  const outside = at(25, 25);
  if (!isBlack(outside)) {
    throw new Error(`[path-boolean-difference] outside (25,25) expected black, got #${hex(outside)}`);
  }
}

function isOrange(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) > 150 && ((rgb >> 8) & 0xff) > 50 && ((rgb >> 8) & 0xff) < 140 && (rgb & 0xff) < 30;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
