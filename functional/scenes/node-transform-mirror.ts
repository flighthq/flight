// node-transform-mirror — validates that a REFLECTED (negative determinant) local matrix survives
// setNodeLocalMatrix and reaches the rasterizer as a mirror.
//
// The mirror has to arrive as a MATRIX, not as a negative scaleX. Assigning scaleX = -1 writes the
// authored field directly and always worked; the defect this scene guards lived on the matrix →
// decomposed-fields path (decomposeMatrixToTransform2D), which carried the reflection on scaleY while
// deriving skewX as though scaleY were positive. A flip-X matrix (-1, 0, 0, 1) therefore came back out
// of the round-trip as (-1, 0, 0, -1) — a 180° ROTATION, not a horizontal mirror.
//
// So the glyph must be asymmetric on BOTH axes, or the two outcomes are indistinguishable: a shape
// symmetric across the mirror line renders identically whether it was mirrored or rotated, and the
// scene would pass against the defect it exists to catch. The glyph here is an "Γ" — a tall bar with an
// arm along its TOP — and the two candidate renderings put that arm on opposite sides of the pivot row.
// The oracle samples both places, so it fails in each direction rather than only proving the arm is
// somewhere.
//
// The control uses an identity-linear matrix (determinant +1) through the same setNodeLocalMatrix call,
// so a failure that hits both copies indicts the scene rather than reflection handling.
//
// This oracle gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back, so
// it checks only that the target element has children and returns before any oracle runs
// (functionalVerify.ts). DOM renders this scene's defect identically to the others; nothing here detects
// it. Do not read a green dom tick on this scene as reflection coverage.
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayObject,
  createMatrix,
  createShape,
  getBitmapPixelRgb,
  setNodeLocalMatrix,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Glyph in local coordinates: a bar down the left edge and an arm along the top, going right.
const BAR_WIDTH = 30;
const GLYPH_HEIGHT = 200;
const ARM_LENGTH = 120;
const ARM_HEIGHT = 40;

// Both copies sit on this row. Chosen so the mirrored copy stays fully on-canvas under EITHER
// rendering: the correct mirror runs downward to y = 500, the defect's 180° rotation runs upward to
// y = 100. A row that clipped one of them would weaken the discriminator into a visibility test.
const ROW_Y = 300;
const CONTROL_X = 100;
// The mirrored copy's local origin: local +x runs LEFT from here, so the glyph occupies x = 500..620.
const MIRROR_X = 620;

const FILL = 0x33ccff;

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayObject();

const control = createGlyph();
// Identity linear part, determinant +1 — the same code path with nothing to reflect.
setNodeLocalMatrix(control, createMatrix(1, 0, 0, 1, CONTROL_X, ROW_Y));
addNodeChild(root, control);

const mirrored = createGlyph();
// Flip across X: determinant -1. This is the matrix the defect could not round-trip.
setNodeLocalMatrix(mirrored, createMatrix(-1, 0, 0, 1, MIRROR_X, ROW_Y));
addNodeChild(root, mirrored);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  // The control's arm runs right from its bar, below the row line.
  if (!isFill(at(CONTROL_X + BAR_WIDTH + 40, ROW_Y + ARM_HEIGHT / 2))) {
    throw new Error(
      `[node-transform-mirror] control arm missing — got #${hex(at(CONTROL_X + BAR_WIDTH + 40, ROW_Y + ARM_HEIGHT / 2))}`,
    );
  }

  // A point in the mirrored copy's arm, clear of its bar. Under the correct mirror the arm runs BELOW
  // the row line; under the defect's 180° rotation it runs above it instead.
  const armX = MIRROR_X - BAR_WIDTH - 60;
  const below = at(armX, ROW_Y + ARM_HEIGHT / 2);
  const above = at(armX, ROW_Y - ARM_HEIGHT / 2);

  if (!isFill(below)) {
    throw new Error(
      `[node-transform-mirror] reflection lost: mirrored arm is not below the row line — got #${hex(below)}. ` +
        `A flip-X matrix decomposed to a 180° rotation instead of a mirror.`,
    );
  }
  if (isFill(above)) {
    throw new Error(
      `[node-transform-mirror] mirrored arm found ABOVE the row line — got #${hex(above)}. ` +
        `That is the 180°-rotation rendering, not a horizontal mirror.`,
    );
  }

  // The mirror must run leftward from its origin: nothing may spill to the right of MIRROR_X.
  const spill = at(MIRROR_X + 60, ROW_Y + ARM_HEIGHT / 2);
  if (isFill(spill)) {
    throw new Error(`[node-transform-mirror] mirrored glyph extends right of its origin — got #${hex(spill)}`);
  }
}

function createGlyph() {
  const shape = createShape();
  appendShapeBeginFill(shape, FILL, 1);
  // Authored edge-to-edge rather than overlapping at the corner: two rects that overlap would depend on
  // the fill rule to cancel the shared corner, making the glyph's silhouette a property of the
  // rasterizer instead of the scene.
  appendShapeRectangle(shape, 0, 0, BAR_WIDTH, GLYPH_HEIGHT);
  appendShapeRectangle(shape, BAR_WIDTH, 0, ARM_LENGTH - BAR_WIDTH, ARM_HEIGHT);
  appendShapeEndFill(shape);
  return shape;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isFill(rgb: number): boolean {
  // The fill is light blue; the background is opaque black. A generous band keeps the check robust to
  // per-backend antialiasing without admitting the background.
  return channel(rgb, 8) > 100 && channel(rgb, 0) > 150;
}
