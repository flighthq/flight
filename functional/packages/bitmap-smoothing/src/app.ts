// bitmap-smoothing — validates Bitmap.smoothing: nearest-neighbor (smoothing=false) vs bilinear
// (smoothing=true) upscaling. A tiny 4×4 high-contrast checkerboard is drawn twice, scaled up 40× to
// 160px. With smoothing OFF, each source texel becomes a crisp solid block: cell centers are pure
// black/white and cell-to-cell edges are hard. With smoothing ON, the GPU/canvas bilinearly blends
// adjacent texels, so a sample taken exactly on a black↔white cell boundary is a mid-gray — the
// defining visual difference between the two modes.
//
// This is visual because the difference only exists at the magnified texel edges produced by scaling;
// it cannot be observed without actually rasterizing the upscaled image.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// 4×4 checkerboard, cell (col+row) even → white, odd → black. Top-left (0,0) is white.
const GRID = 4;
const SCALE = 40; // each source texel becomes a 40×40 output block → 160px total.

// Two copies side by side.
const CRISP_X = 120; // smoothing = false
const CRISP_Y = 200;
const SMOOTH_X = 480; // smoothing = true
const SMOOTH_Y = 200;

function buildCheckerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext('2d')!;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(col, row, 1, 1);
    }
  }
  return canvas;
}

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [BitmapKind],
});

const root = createDisplayContainer();

function placeChecker(x: number, y: number, smoothing: boolean): void {
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(buildCheckerCanvas());
  bmp.data.smoothing = smoothing;
  bmp.x = x;
  bmp.y = y;
  bmp.scaleX = SCALE;
  bmp.scaleY = SCALE;
  invalidateNodeLocalTransform(bmp);
  addNodeChild(root, bmp);
}

placeChecker(CRISP_X, CRISP_Y, false);
placeChecker(SMOOTH_X, SMOOTH_Y, true);

render(root);

// Local-cell helpers: the center of cell (col,row) in the 160px upscaled image is at
// ((col + 0.5) * SCALE, (row + 0.5) * SCALE). A black↔white boundary sits at (col * SCALE).
function cellCenter(col: number, row: number): readonly [number, number] {
  return [(col + 0.5) * SCALE, (row + 0.5) * SCALE];
}

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // --- smoothing = FALSE: crisp cells, pure colors at centers ---
  // White cell (0,0).
  const [wcx, wcy] = cellCenter(0, 0);
  const crispWhite = at(CRISP_X + wcx, CRISP_Y + wcy);
  if (!isWhite(crispWhite)) {
    throw new Error(`[bitmap-smoothing] crisp white-cell center not white — got #${hex(crispWhite)}`);
  }
  // Black cell (1,0).
  const [bcx, bcy] = cellCenter(1, 0);
  const crispBlack = at(CRISP_X + bcx, CRISP_Y + bcy);
  if (!isBlack(crispBlack)) {
    throw new Error(`[bitmap-smoothing] crisp black-cell center not black — got #${hex(crispBlack)}`);
  }

  // --- smoothing = TRUE: bilinear blend at the cell boundary → mid-gray ---
  // Vertical boundary between white cell (0,0) and black cell (1,0) is at local x = 1*SCALE; sample
  // at the vertical center of that row. Nearest-neighbor would give pure black or white here; bilinear
  // gives a gray. We also confirm the smoothing copy is still pure at cell centers (the blend is local
  // to edges, not a global wash).
  const boundaryX = 1 * SCALE; // = 40
  const boundaryY = 0.5 * SCALE; // row 0 vertical center = 20
  const smoothEdge = at(SMOOTH_X + boundaryX, SMOOTH_Y + boundaryY);
  if (!isMidGray(smoothEdge)) {
    throw new Error(
      `[bitmap-smoothing] smoothing=true cell boundary not blended to mid-gray — got #${hex(smoothEdge)}`,
    );
  }
  // Smoothing copy still resolves a pure white cell center (blend is edge-local).
  const smoothWhite = at(SMOOTH_X + wcx, SMOOTH_Y + wcy);
  if (!isWhite(smoothWhite)) {
    throw new Error(`[bitmap-smoothing] smoothing=true white-cell center not white — got #${hex(smoothWhite)}`);
  }
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
function isMidGray(rgb: number): boolean {
  const r = channel(rgb, 16);
  const g = channel(rgb, 8);
  const b = channel(rgb, 0);
  return r >= 60 && r <= 200 && g >= 60 && g <= 200 && b >= 60 && b <= 200;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
