// filter-color-matrix — validates ColorMatrixFilter (invert) on a known 4-colour source.
//
// Reference for the surface-based filter suite: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle checks the
// filter's defining transform on pixels we chose, instead of eyeballing a busy scene.
import { createColorMatrixFilter } from '@flighthq/filters';
import { applyColorMatrixFilterToSurface } from '@flighthq/filters-surface';
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
const HALF = TILE / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// 4-quadrant source: red / green / blue / white (packed RGBA, opaque).
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, 0, 0, HALF, HALF), 0xff0000ff);
fillSurfaceRectangle(createSurfaceRegion(source, HALF, 0, HALF, HALF), 0x00ff00ff);
fillSurfaceRectangle(createSurfaceRegion(source, 0, HALF, HALF, HALF), 0x0000ffff);
fillSurfaceRectangle(createSurfaceRegion(source, HALF, HALF, HALF, HALF), 0xffffffff);

// Invert: channel' = 255 − channel; alpha unchanged. 4×5 row-major matrix.
const INVERT = [-1, 0, 0, 0, 255, 0, -1, 0, 0, 255, 0, 0, -1, 0, 255, 0, 0, 0, 1, 0];
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyColorMatrixFilterToSurface(result, createSurfaceRegion(source), createColorMatrixFilter(INVERT));

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

// Oracle: each result quadrant is the exact inverse of its source quadrant.
const EXPECT = [
  { qx: 0, qy: 0, rgb: 0x00ffff }, // red   → cyan
  { qx: 1, qy: 0, rgb: 0xff00ff }, // green → magenta
  { qx: 0, qy: 1, rgb: 0xffff00 }, // blue  → yellow
  { qx: 1, qy: 1, rgb: 0x000000 }, // white → black
];

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  for (const { qx, qy, rgb } of EXPECT) {
    const px = Math.round((RESULT_X + qx * HALF + HALF / 2) * s);
    const py = Math.round((TOP + qy * HALF + HALF / 2) * s);
    const got = getSurfacePixelRgb(frame, px, py);
    if (!channelsClose(got, rgb)) {
      throw new Error(`[filter-color-matrix] quadrant (${qx},${qy}) expected #${hex(rgb)}, got #${hex(got)}`);
    }
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
