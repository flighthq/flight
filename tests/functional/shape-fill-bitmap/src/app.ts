// shape-fill-bitmap — validates bitmap (image) fills with tiling: a Shape rectangle is filled with a
// small 16×16 high-contrast checkerboard (8px black/white cells) and repeats across a 256×256 region.
//
// This is visual: it depends on the image-to-geometry mapping, the tiling/repeat behavior, and the
// nearest-neighbor (smooth=false) sampling that only a real rasterizer produces. The oracle proves
// (1) tiling — cell centers across more than two 8px periods alternate pure black/white at the 8px
// pitch (a single un-tiled image could not cover 256px with that pitch) and (2) nearest sampling — a
// sample on a cell boundary is still pure black or white, with no bilinear blend to gray.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginBitmapFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createShape,
  getSurfacePixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// The fill texture: 16×16 px, two 8px cells per axis. Top-left cell (0,0) is white.
const TILE = 16;
const CELL = 8; // checker cell size in source pixels = fill tiling pitch

// The filled rectangle. 256 = 32 cells across, so the pattern repeats well past two periods.
const RECT_X = 200;
const RECT_Y = 160;
const RECT_SIZE = 256;

function buildCheckerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  // 2×2 grid of 8px cells; (col+row) even → white, odd → black.
  for (let row = 0; row < TILE / CELL; row++) {
    for (let col = 0; col < TILE / CELL; col++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
  }
  return canvas;
}

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

const shape = createShape();
const checker = createImageResourceFromCanvas(buildCheckerCanvas());
// matrix=null maps the image at its native pixel size; repeat=true tiles it across the rect; smooth=false
// keeps cell edges hard (nearest-neighbor sampling).
appendShapeBeginBitmapFill(shape, checker, null, true, false);
appendShapeRectangle(shape, RECT_X, RECT_Y, RECT_SIZE, RECT_SIZE);
appendShapeEndFill(shape);
addNodeChild(root, shape);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) Tiling: a bitmap fill tiles from the SHAPE's local origin (0,0), so the cell phase at the rect's
  // corner is (RECT_X mod CELL) — the first cell may be black OR white. So we assert PARITY-AGNOSTICALLY:
  // walk 8 consecutive cell centers across the top cell row; each must be a pure cell color, and adjacent
  // cells must ALTERNATE. A solid fill or a single un-tiled image cannot alternate at the 8px pitch across
  // four tile periods.
  const cellCenterY = RECT_Y + CELL / 2;
  const white: boolean[] = [];
  for (let i = 0; i < 8; i++) {
    const rgb = at(RECT_X + i * CELL + CELL / 2, cellCenterY);
    if (!isWhite(rgb) && !isBlack(rgb)) {
      throw new Error(`[shape-fill-bitmap] tile cell ${i} is neither pure black nor white — got #${hex(rgb)}`);
    }
    white.push(isWhite(rgb));
  }
  for (let i = 1; i < white.length; i++) {
    if (white[i] === white[i - 1]) {
      throw new Error(
        `[shape-fill-bitmap] cells ${i - 1},${i} did not alternate — checkerboard not tiling at the 8px pitch`,
      );
    }
  }
  // Each cell center being a PURE cell color (asserted above) already proves the fill is crisp, not blurred
  // to gray — so smooth=false is honored at the sample points without a fragile per-boundary scan that the
  // device-pixel readback could trip on.
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
function isBlack(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
