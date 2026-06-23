// node-visibility — validates that a node with `visible = false` is omitted from the render walk while
// its siblings still draw normally.
//
// This needs a real render because visibility gating is an emergent property of the scene-graph draw
// pass: both shapes carry an identical opaque fill, but only the visible one may produce pixels. The
// scene draws two separate, non-overlapping filled rectangles in distinct colors. One is left visible;
// the other has `.visible = false` (followed by invalidateNodeAppearance, since visibility is an
// appearance field). The oracle samples (1) the visible shape's region (must read its color), (2) the
// hidden shape's region (must read background — proof it did not draw), and (3) an untouched area (must
// read background). jsdom unit tests cannot exercise this because there are no rendered pixels to gate.
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

const WIDTH = 800;
const HEIGHT = 600;

// Visible shape (red) — left region of the canvas.
const VISIBLE_X = 120;
const VISIBLE_Y = 200;
const VISIBLE_W = 200;
const VISIBLE_H = 200;
const VISIBLE_FILL = 0xff0000; // red

// Hidden shape (green) — right region, fully separate from the visible one.
const HIDDEN_X = 480;
const HIDDEN_Y = 200;
const HIDDEN_W = 200;
const HIDDEN_H = 200;
const HIDDEN_FILL = 0x00ff00; // green

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const visibleShape = createShape();
appendShapeBeginFill(visibleShape, VISIBLE_FILL, 1);
appendShapeRectangle(visibleShape, VISIBLE_X, VISIBLE_Y, VISIBLE_W, VISIBLE_H);
appendShapeEndFill(visibleShape);
addNodeChild(root, visibleShape);

const hiddenShape = createShape();
appendShapeBeginFill(hiddenShape, HIDDEN_FILL, 1);
appendShapeRectangle(hiddenShape, HIDDEN_X, HIDDEN_Y, HIDDEN_W, HIDDEN_H);
appendShapeEndFill(hiddenShape);
hiddenShape.visible = false; // gated out of the render walk
invalidateNodeAppearance(hiddenShape);
addNodeChild(root, hiddenShape);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) Center of the visible shape: must read its red fill.
  const visibleCenter = at(VISIBLE_X + VISIBLE_W / 2, VISIBLE_Y + VISIBLE_H / 2);
  if (!isRed(visibleCenter)) {
    throw new Error(`[node-visibility] visible shape region not red — got #${hex(visibleCenter)}`);
  }

  // 2) Center of the hidden shape: must read background. If visibility were ignored, this would be green.
  const hiddenCenter = at(HIDDEN_X + HIDDEN_W / 2, HIDDEN_Y + HIDDEN_H / 2);
  if (!isBackground(hiddenCenter)) {
    throw new Error(`[node-visibility] hidden shape region drew (expected background) — got #${hex(hiddenCenter)}`);
  }

  // 3) An untouched area between/below the shapes: background, proving nothing leaked.
  const empty = at(400, 520);
  if (!isBackground(empty)) {
    throw new Error(`[node-visibility] empty area not background — got #${hex(empty)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
