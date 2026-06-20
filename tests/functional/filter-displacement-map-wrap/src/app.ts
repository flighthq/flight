// filter-displacement-map-wrap — validates DisplacementMapFilter (wrap mode, X-driven) on a known source.
//
// Surface-based filter pattern: build a known source surface and a known displacement-map surface, apply
// the filter ONCE via applyDisplacementMapFilterToSurface, then blit source | result 1:1 as bitmaps. The
// warp math runs on the surface in JS, so every backend draws identical bytes — exact cross-backend parity.
//
// The map's RED channel drives X displacement (componentX=0, scaleX=24). The surface sampler reads source
// at  rawSampleX = px + (mapVx/255 − 0.5)·scaleX. RED=255 (left map half) ⇒ output px reads source px+12;
// RED=0 (right map half) ⇒ output px reads source px−12. The single white source line at x=128 therefore
// lands at output x=116 in the left region and output x=140 in the right region — column 128 goes black.
import { applyDisplacementMapFilterToSurface, createDisplacementMapFilter } from '@flighthq/filters';
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
const LINE_X = 128; // original vertical white line column
const SHIFT = 12; // 0.5 × scaleX (24); RED 255 ⇒ +SHIFT source read, RED 0 ⇒ −SHIFT source read

// Source: black tile with a single vertical white line at x = LINE_X.
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, LINE_X, 0, 1, TILE), 0xffffffff);

// Displacement map: RED = 255 in left half, RED = 0 in right half (128 is neutral, so left shifts +, right −).
const map = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(map, 0, 0, HALF, TILE), 0xff0000ff);
fillSurfaceRectangle(createSurfaceRegion(map, HALF, 0, HALF, TILE), 0x000000ff);

const filter = createDisplacementMapFilter({
  mode: 'wrap',
  componentX: 0,
  componentY: 1,
  scaleX: 24,
  scaleY: 0,
});
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyDisplacementMapFilterToSurface(result, createSurfaceRegion(source), createSurfaceRegion(map), filter);

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

// Oracle: the white line has been displaced away from its original column.
//  • output x = 116 (left map region, +SHIFT read) is white,
//  • output x = 140 (right map region, −SHIFT read) is white,
//  • the original column x = 128 is now black (the line moved off it).
const ROW = TILE / 2; // sample mid-height, away from any tile edge

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  if (filter.scaleX === undefined || filter.componentX === undefined) {
    throw new Error('[filter-displacement-map-wrap] filter missing scaleX/componentX');
  }

  const sampleY = Math.round((TOP + ROW) * s);
  const at = (col: number): number => getSurfacePixelRGB(frame, Math.round((RESULT_X + col) * s), sampleY);

  const leftShifted = at(LINE_X - SHIFT); // 116 — line moved here in the left (RED 255) region
  if (!channelsClose(leftShifted, 0xffffff)) {
    throw new Error(
      `[filter-displacement-map-wrap] expected white displaced line at result x=${LINE_X - SHIFT}, got #${hex(leftShifted)}`,
    );
  }

  const rightShifted = at(LINE_X + SHIFT); // 140 — line moved here in the right (RED 0) region
  if (!channelsClose(rightShifted, 0xffffff)) {
    throw new Error(
      `[filter-displacement-map-wrap] expected white displaced line at result x=${LINE_X + SHIFT}, got #${hex(rightShifted)}`,
    );
  }

  const original = at(LINE_X); // 128 — the line is no longer here
  if (!channelsClose(original, 0x000000)) {
    throw new Error(
      `[filter-displacement-map-wrap] expected original column x=${LINE_X} to be black after displacement, got #${hex(original)}`,
    );
  }
}

function channelsClose(a: number, b: number, tol = 32): boolean {
  return (
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= tol &&
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= tol &&
    Math.abs((a & 255) - (b & 255)) <= tol
  );
}

function hex(rgb: number): string {
  return rgb.toString(16).padStart(6, '0');
}
