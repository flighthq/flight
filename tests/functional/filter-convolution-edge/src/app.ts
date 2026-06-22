// filter-convolution-edge — validates ConvolutionFilter (3×3 edge-detect) on a known source.
//
// Reference for the surface-based filter suite: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle checks the
// filter's defining transform on pixels we chose, instead of eyeballing a busy scene.
import { createConvolutionFilter } from '@flighthq/filters';
import { applyConvolutionFilterToSurface } from '@flighthq/filters-surface';
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
const SQUARE = 160;
const SQUARE_OFFSET = (TILE - SQUARE) / 2; // 48 — centers the square within the tile
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: an opaque white square centered on opaque black (packed RGBA).
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_OFFSET, SQUARE_OFFSET, SQUARE, SQUARE), 0xffffffff);

// 3×3 edge-detect (Laplacian) kernel, divisor 1. Kernel sums to zero, so flat regions collapse to black
// while edges (white↔black transitions) light up bright.
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyConvolutionFilterToSurface(
  result,
  createSurfaceRegion(source),
  createConvolutionFilter({
    matrix: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    matrixX: 3,
    matrixY: 3,
    divisor: 1,
  }),
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

// Oracle: edge-detect collapses the flat square interior to near-black, while the square's edge stays
// bright. Sample the RESULT tile in tile-local coordinates.
const INTERIOR_X = TILE / 2; // 128 — center of the square, a flat region
const INTERIOR_Y = TILE / 2;
const EDGE_X = SQUARE_OFFSET; // 48 — the square's left edge, a high-contrast transition
const EDGE_Y = TILE / 2;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const interior = getSurfacePixelRgb(
    frame,
    Math.round((RESULT_X + INTERIOR_X) * s),
    Math.round((TOP + INTERIOR_Y) * s),
  );
  const edge = getSurfacePixelRgb(frame, Math.round((RESULT_X + EDGE_X) * s), Math.round((TOP + EDGE_Y) * s));

  const interiorMax = maxChannel(interior);
  if (interiorMax >= 60) {
    throw new Error(
      `[filter-convolution-edge] square interior should collapse to near-black (<60), got #${hex(interior)}`,
    );
  }

  const edgeMax = maxChannel(edge);
  if (edgeMax <= 150) {
    throw new Error(`[filter-convolution-edge] square edge should detect bright (>150), got #${hex(edge)}`);
  }
}

function maxChannel(rgb: number): number {
  return Math.max((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
}

function hex(rgb: number): string {
  return rgb.toString(16).padStart(6, '0');
}
