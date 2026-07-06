// filter-drop-shadow-hide-object — validates DropShadowFilter with hideObject on a known source surface.
//
// Surface-based filter pattern: build a known source surface (an opaque white square on black), apply the
// drop-shadow filter ONCE via applyDropShadowFilterToSurface to get the tinted, blurred shadow MASK, then
// composite ONLY that mask at the shadow offset — hideObject means the source object is dropped from the
// output. The filter math runs on the surface in JS, so every backend draws identical bytes (exact
// cross-backend parity) and the oracle checks the defining behaviour: a red shadow appears at the offset,
// and the square's own footprint is no longer white because the object is hidden.
import { createDropShadowFilter } from '@flighthq/filters';
import { getShadowFilterOffset } from '@flighthq/filters-math';
import { applyDropShadowFilterToSurface } from '@flighthq/filters-surface';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  compositeSurfacePixels,
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
const SQUARE = 120;
const SQUARE_X = (TILE - SQUARE) / 2; // 68 — square centered within the tile
const SQUARE_Y = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: opaque-white square on a fully TRANSPARENT tile (packed RGBA). The shadow mask is derived from
// source alpha, so the background must be transparent — an opaque background would tint the whole tile red.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);

// hideObject drop shadow: red (0xff0000), distance 14 @ 45°, blur 4. applyDropShadowFilterToSurface writes
// the tinted, blurred shadow MASK at the source position; getShadowFilterOffset gives the (dx, dy) at which
// to composite it. With hideObject the original source is NOT composited on top — only the shadow remains.
const filter = createDropShadowFilter({
  distance: 14,
  angle: 45,
  color: 0xff0000,
  blurX: 4,
  blurY: 4,
  hideObject: true,
});
const { dx, dy } = getShadowFilterOffset(filter, { dx: 0, dy: 0 });

const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyDropShadowFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

const result = createSurface(TILE, TILE, 0x000000ff);
compositeSurfacePixels(createSurfaceRegion(result, dx, dy, TILE, TILE), mask);

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
blit(result.data, RESULT_X);
render(root);

// Oracle (sampled in the RESULT tile):
//  - The shadow's centre (the square footprint shifted by the offset) is solid red — present and opaque.
//  - That same footprint is NOT white: hideObject dropped the source object.
//  - A far corner the shadow never reaches stays black background.
const SHADOW_CX = SQUARE_X + SQUARE / 2 + dx; // 138 — shadow square centre in result-tile coords
const SHADOW_CY = SQUARE_Y + SQUARE / 2 + dy; // 138
const CORNER = 16;

export function assertRender(frame: Readonly<Surface>): void {
  if (!(filter as { hideObject?: boolean }).hideObject) {
    throw new Error('[filter-drop-shadow-hide-object] filter is missing hideObject');
  }
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const shadow = getSurfacePixelRgb(frame, Math.round((RESULT_X + SHADOW_CX) * s), Math.round((TOP + SHADOW_CY) * s));
  if (!channelsClose(shadow, 0xff0000, 40)) {
    throw new Error(`[filter-drop-shadow-hide-object] shadow centre expected red, got #${hex(shadow)}`);
  }
  if (isWhite(shadow)) {
    throw new Error(`[filter-drop-shadow-hide-object] square footprint is white — object not hidden`);
  }

  const corner = getSurfacePixelRgb(frame, Math.round((RESULT_X + CORNER) * s), Math.round((TOP + CORNER) * s));
  if (!channelsClose(corner, 0x000000, 40)) {
    throw new Error(`[filter-drop-shadow-hide-object] corner expected black background, got #${hex(corner)}`);
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

function isWhite(rgb: number): boolean {
  return ((rgb >> 16) & 255) > 200 && ((rgb >> 8) & 255) > 200 && (rgb & 255) > 200;
}
