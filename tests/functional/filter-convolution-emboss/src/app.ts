// filter-convolution-emboss — validates ConvolutionFilter (emboss kernel) on a centered white square.
//
// Surface-based filter pattern: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The convolution runs on the
// surface in JS, so every backend draws identical bytes — exact cross-backend parity — and the
// oracle checks the emboss signature on pixels we chose, instead of eyeballing a busy scene.
//
// Emboss kernel (3×3, row-major), divisor 1, bias 128:
//   -2 -1  0
//   -1  1  1
//    0  1  2
// The negative lobe sits top-left, the positive lobe bottom-right (this path is correlation, not a
// flipped convolution: weight (dx,dy) multiplies the sample at the same (dx,dy) offset). On a white
// square over black, the flat interior is white through every weight (sum 1) → still white, and the
// flat black background is 0 + 128 = mid-gray. The emboss signature lives on the 1-pixel band just
// OUTSIDE the square: along the top/left edges a black pixel sees the square's white through the
// positive bottom-right weights → lighter than 128; along the bottom/right edges a black pixel sees
// the white through the negative top-left weights → darker than 128.
import { applyConvolutionFilterToSurface, createConvolutionFilter } from '@flighthq/filters';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createSurface,
  createSurfaceRegion,
  fillSurfaceRectangle,
  getSurfacePixelRgb,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const SQUARE = 128;
const SQUARE_X = (TILE - SQUARE) / 2; // 64
const SQUARE_Y = (TILE - SQUARE) / 2; // 64
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: centered white square on opaque black (packed RGBA).
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);

// Emboss kernel: divisor 1 keeps raw weighted sums, bias 128 centers flat regions on mid-gray.
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyConvolutionFilterToSurface(
  result,
  createSurfaceRegion(source),
  createConvolutionFilter({ matrix: [-2, -1, 0, -1, 1, 1, 0, 1, 2], matrixX: 3, matrixY: 3, divisor: 1, bias: 128 }),
);

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xff000000,
  kinds: [BitmapKind],
});

const TOP = (height - TILE) / 2;
const root = createDisplayContainer();

function blit(data: Uint8ClampedArray, x: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  canvas.getContext('2d')!.putImageData(new ImageData(data, TILE, TILE), 0, 0);
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(canvas);
  bmp.data.smoothing = false;
  bmp.x = x;
  bmp.y = TOP;
  addNodeChild(root, bmp);
}

blit(source.data, SOURCE_X);
blit(result, RESULT_X);
render(root);

// Oracle samples (tile-local coordinates within the RESULT tile). The emboss edge band is one pixel
// wide and sits just OUTSIDE the square, so sample the black pixel adjacent to each edge midpoint —
// the interior is flat white and would not show the effect.
//   - flat black background → mid-gray (~128)
//   - top edge (black pixel one row above the square) → lighter than 128 on every channel
//   - bottom edge (black pixel one row below the square) → darker than 128 on every channel
const FLAT_X = 20;
const FLAT_Y = 128;
const TOP_EDGE_X = SQUARE_X + SQUARE / 2; // 128 — mid top edge
const TOP_EDGE_Y = SQUARE_Y - 1; // 63 — one row above the white square
const BOTTOM_EDGE_X = SQUARE_X + SQUARE / 2; // 128 — mid bottom edge
const BOTTOM_EDGE_Y = SQUARE_Y + SQUARE; // 192 — one row below the white square
const GRAY = 0x808080;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const flat = sampleResult(frame, s, FLAT_X, FLAT_Y);
  if (!channelsClose(flat, GRAY, 40)) {
    throw new Error(
      `[filter-convolution-emboss] flat background expected mid-gray #${hex(GRAY)} (tol 40), got #${hex(flat)}`,
    );
  }

  const topEdge = sampleResult(frame, s, TOP_EDGE_X, TOP_EDGE_Y);
  if (!channelsAbove(topEdge, 128)) {
    throw new Error(`[filter-convolution-emboss] top edge expected lighter than mid-gray, got #${hex(topEdge)}`);
  }

  const bottomEdge = sampleResult(frame, s, BOTTOM_EDGE_X, BOTTOM_EDGE_Y);
  if (!channelsBelow(bottomEdge, 128)) {
    throw new Error(`[filter-convolution-emboss] bottom edge expected darker than mid-gray, got #${hex(bottomEdge)}`);
  }
}

function sampleResult(frame: Readonly<Surface>, s: number, tx: number, ty: number): number {
  return getSurfacePixelRgb(frame, Math.round((RESULT_X + tx) * s), Math.round((TOP + ty) * s));
}

function channelsAbove(value: number, threshold: number): boolean {
  return ((value >> 16) & 255) > threshold && ((value >> 8) & 255) > threshold && (value & 255) > threshold;
}

function channelsBelow(value: number, threshold: number): boolean {
  return ((value >> 16) & 255) < threshold && ((value >> 8) & 255) < threshold && (value & 255) < threshold;
}

function channelsClose(a: number, b: number, tol = 16): boolean {
  return (
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= tol &&
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= tol &&
    Math.abs((a & 255) - (b & 255)) <= tol
  );
}

function hex(rgb: number): string {
  return rgb.toString(16).padStart(6, '0');
}
