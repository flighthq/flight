// filter-color-matrix-brightness — validates ColorMatrixFilter (additive brightness) on a known source.
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
  getSurfacePixelRGB,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const HALF = TILE / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Solid mid-gray source (packed RGBA, opaque).
const source = createSurface(TILE, TILE, 0x808080ff);

// Additive brightness: channel' = channel + 60; alpha unchanged. 4×5 row-major matrix.
const BRIGHTNESS = [1, 0, 0, 0, 60, 0, 1, 0, 0, 60, 0, 0, 1, 0, 60, 0, 0, 0, 1, 0];
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyColorMatrixFilterToSurface(result, createSurfaceRegion(source), createColorMatrixFilter(BRIGHTNESS));

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

// Oracle: mid-gray 0x80 + 60 = 0xBC on every channel.
const EXPECT = 0xbcbcbc;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  const px = Math.round((RESULT_X + HALF) * s);
  const py = Math.round((TOP + HALF) * s);
  const got = getSurfacePixelRGB(frame, px, py);
  if (!channelsClose(got, EXPECT, 8)) {
    throw new Error(`[filter-color-matrix-brightness] expected #${hex(EXPECT)}, got #${hex(got)}`);
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
