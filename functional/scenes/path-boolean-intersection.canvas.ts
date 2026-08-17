// path-boolean-intersection — validates that a boolean intersection of two overlapping rectangular
// paths renders correctly, covering only the shared overlap region.
//
// Two axis-aligned rectangles are created as Paths: rect A (100x100 at 50,50) and rect B
// (100x100 at 100,100), overlapping in a 50x50 region at (100,100)-(150,150). Their intersection
// is rendered as a magenta filled shape. The scene assertion verifies:
//   - the overlap center (125,125) is magenta (inside the intersection),
//   - a point exclusive to rect A (75,75) is background black (not in the intersection),
//   - a point exclusive to rect B (175,175) is background black,
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
  getBitmapPixelRgb,
  intersectPaths,
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
    'On an opaque black field (250×250): a single magenta 50×50 square at (100,100)–(150,150) — ' +
    "the overlap region of two 100×100 rectangles. Rectangle A's exclusive area " +
    "(50,50)–(100,100) is black. Rectangle B's exclusive area (150,150)–(200,200) is black. " +
    'No gradient, no stroke — a single flat magenta square on black.',
});

const pathA = createPath();
appendPathRectangle(pathA, 50, 50, 100, 100);

const pathB = createPath();
appendPathRectangle(pathB, 100, 100, 100, 100);

const result = intersectPaths(pathA, pathB);

const root = createDisplayObject();
const shape = createShape();
appendShapeBeginFill(shape, 0xcc00ccff, 1);
appendShapePath(shape, result.commands, result.data, result.winding);
appendShapeEndFill(shape);
invalidateNodeAppearance(shape);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  const overlap = at(125, 125);
  if (!isMagenta(overlap)) {
    throw new Error(`[path-boolean-intersection] overlap (125,125) expected magenta, got #${hex(overlap)}`);
  }

  const exclusiveA = at(75, 75);
  if (!isBlack(exclusiveA)) {
    throw new Error(`[path-boolean-intersection] exclusive A (75,75) expected black, got #${hex(exclusiveA)}`);
  }

  const exclusiveB = at(175, 175);
  if (!isBlack(exclusiveB)) {
    throw new Error(`[path-boolean-intersection] exclusive B (175,175) expected black, got #${hex(exclusiveB)}`);
  }

  const outside = at(25, 25);
  if (!isBlack(outside)) {
    throw new Error(`[path-boolean-intersection] outside (25,25) expected black, got #${hex(outside)}`);
  }
}

function isMagenta(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) > 150 && ((rgb >> 8) & 0xff) < 90 && (rgb & 0xff) > 150;
}
function isBlack(rgb: number): boolean {
  return ((rgb >> 16) & 0xff) < 30 && ((rgb >> 8) & 0xff) < 30 && (rgb & 0xff) < 30;
}
function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
