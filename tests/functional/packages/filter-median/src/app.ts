// filter-median — validates MedianFilter (radius 2) removing salt noise on a known blue field.
//
// Surface-based filter test: build a solid blue source seeded with scattered single-pixel red specks
// (salt noise), apply the filter ONCE via applyMedianFilterToSurface, then blit source | result 1:1 as
// bitmaps. The median math runs on the surface in JS, so every backend draws identical bytes — exact
// cross-backend parity. A median of radius 2 (a 5×5 neighborhood) is dominated by the surrounding blue,
// so each isolated red speck is replaced by blue; the oracle checks a former speck coordinate and a
// clean blue region on the result tile.
import { createMedianFilter } from '@flighthq/filters';
import { applyMedianFilterToSurface } from '@flighthq/filters-surface';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createSurface,
  createSurfaceRegion,
  getSurfacePixelRgb,
  setSurfacePixel,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const SOURCE_X = 120;
const RESULT_X = 424;

// Solid blue field with scattered single-pixel red specks (salt noise) at known coordinates.
const source = createSurface(TILE, TILE, 0x0000ffff);
const SPECKS = [
  { x: 64, y: 64 },
  { x: 192, y: 48 },
  { x: 128, y: 128 },
  { x: 40, y: 200 },
  { x: 210, y: 180 },
  { x: 96, y: 220 },
];
for (const { x, y } of SPECKS) setSurfacePixel(source, x, y, 0xff0000ff);

const result = new Uint8ClampedArray(TILE * TILE * 4);
applyMedianFilterToSurface(result, createSurfaceRegion(source), createMedianFilter({ radius: 2 }));

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

// Oracle: a former speck coordinate is now blue (the median removed the salt), and a clean blue
// region away from every speck stays blue.
const SPECK = SPECKS[2]; // (128, 128)
const CLEAN = { x: 160, y: 96 }; // no speck nearby

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const speckPx = Math.round((RESULT_X + SPECK.x) * s);
  const speckPy = Math.round((TOP + SPECK.y) * s);
  const speckRgb = getSurfacePixelRgb(frame, speckPx, speckPy);
  if (!isBlue(speckRgb)) {
    throw new Error(`[filter-median] former speck (${SPECK.x},${SPECK.y}) expected blue, got #${hex(speckRgb)}`);
  }

  const cleanPx = Math.round((RESULT_X + CLEAN.x) * s);
  const cleanPy = Math.round((TOP + CLEAN.y) * s);
  const cleanRgb = getSurfacePixelRgb(frame, cleanPx, cleanPy);
  if (!channelsClose(cleanRgb, 0x0000ff)) {
    throw new Error(`[filter-median] clean region (${CLEAN.x},${CLEAN.y}) expected #0000ff, got #${hex(cleanRgb)}`);
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

function isBlue(rgb: number): boolean {
  return (rgb & 255) > 150 && ((rgb >> 16) & 255) < 80;
}
