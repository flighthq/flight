// filter-color-matrix-grayscale — validates ColorMatrixFilter (luma grayscale) on a known 4-colour source.
//
// Reference for the surface-based filter suite: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle checks the
// filter's defining transform on pixels we chose, instead of eyeballing a busy scene.
import { applyColorMatrixFilterToSurface, createColorMatrixFilter } from '@flighthq/filters';
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
  getSurfacePixelRGB,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const HALF = TILE / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// 4-quadrant source: red / green / blue / white (packed RGBA, opaque).
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, 0, 0, HALF, HALF), 0xff0000ff);
fillSurfaceRectangle(createSurfaceRegion(source, HALF, 0, HALF, HALF), 0x00ff00ff);
fillSurfaceRectangle(createSurfaceRegion(source, 0, HALF, HALF, HALF), 0x0000ffff);
fillSurfaceRectangle(createSurfaceRegion(source, HALF, HALF, HALF, HALF), 0xffffffff);

// Luma grayscale: each output channel = 0.299·R + 0.587·G + 0.114·B; alpha unchanged. 4×5 row-major matrix.
const GRAYSCALE = [0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0, 0, 0, 1, 0];
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyColorMatrixFilterToSurface(result, createSurfaceRegion(source), createColorMatrixFilter(GRAYSCALE));

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

// Oracle: every result quadrant is neutral gray, and the red quadrant maps to its luma ~0.299·255 ≈ 76.
const RED_LUMA = Math.round(0.299 * 255);
const QUADRANTS = [
  { qx: 0, qy: 0 }, // red   → gray ~76
  { qx: 1, qy: 0 }, // green → gray ~150
  { qx: 0, qy: 1 }, // blue  → gray ~29
  { qx: 1, qy: 1 }, // white → gray ~255
];

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  for (const { qx, qy } of QUADRANTS) {
    const px = Math.round((RESULT_X + qx * HALF + HALF / 2) * s);
    const py = Math.round((TOP + qy * HALF + HALF / 2) * s);
    const got = getSurfacePixelRGB(frame, px, py);
    const r = (got >> 16) & 255;
    const g = (got >> 8) & 255;
    const b = got & 255;
    if (Math.abs(r - g) > 8 || Math.abs(g - b) > 8) {
      throw new Error(`[filter-color-matrix-grayscale] quadrant (${qx},${qy}) not neutral gray, got #${hex(got)}`);
    }
  }
  // Red quadrant specifically lands on its luma value.
  const rpx = Math.round((RESULT_X + HALF / 2) * s);
  const rpy = Math.round((TOP + HALF / 2) * s);
  const red = getSurfacePixelRGB(frame, rpx, rpy);
  if (!channelsClose(red, (RED_LUMA << 16) | (RED_LUMA << 8) | RED_LUMA)) {
    throw new Error(`[filter-color-matrix-grayscale] red quadrant expected gray ~${RED_LUMA}, got #${hex(red)}`);
  }
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
