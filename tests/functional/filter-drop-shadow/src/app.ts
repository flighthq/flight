// filter-drop-shadow — validates DropShadowFilter on a centered white square.
//
// Surface-based filter pattern: build a known source surface, apply the filter ONCE via
// applyDropShadowFilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on
// the surface in JS, so every backend draws identical bytes — exact cross-backend parity. drop shadow
// WRITES A TINTED BLURRED ALPHA MASK; the effect is completed here by compositing that mask onto the
// result at the shadow offset (down-right for angle 45) and then drawing the original source on top.
import { createDropShadowFilter } from '@flighthq/filters';
import { getShadowFilterOffset } from '@flighthq/filters-css';
import { applyDropShadowFilterToSurface } from '@flighthq/filters-surface';
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
const SQUARE = 96;
const SQUARE_MIN = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a centered opaque-white square on a fully transparent tile. The square's alpha is what the
// shadow mask is shaped from.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);

// Red shadow, offset 14px at 45° (down-right), blur 4. distance/angle map to a pixel offset via
// getShadowFilterOffset; the surface filter itself only produces the blurred tinted mask in place.
const filter = createDropShadowFilter({
  distance: 14,
  angle: 45,
  color: 0xff0000,
  blurX: 4,
  blurY: 4,
  strength: 1,
});
const { dx, dy } = getShadowFilterOffset(filter);

const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyDropShadowFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

// Composite: shadow mask shifted by (dx, dy) underneath, original source on top (source-over).
const result = new Uint8ClampedArray(TILE * TILE * 4);
for (let y = 0; y < TILE; y++) {
  for (let x = 0; x < TILE; x++) {
    const di = (y * TILE + x) * 4;
    const sx = x - dx;
    const sy = y - dy;
    if (sx >= 0 && sx < TILE && sy >= 0 && sy < TILE) {
      const mi = (sy * TILE + sx) * 4;
      result[di] = mask[mi];
      result[di + 1] = mask[mi + 1];
      result[di + 2] = mask[mi + 2];
      result[di + 3] = mask[mi + 3];
    }
    const a = source.data[di + 3] / 255;
    if (a > 0) {
      const ia = 1 - a;
      result[di] = source.data[di] * a + result[di] * ia;
      result[di + 1] = source.data[di + 1] * a + result[di + 1] * ia;
      result[di + 2] = source.data[di + 2] * a + result[di + 2] * ia;
      result[di + 3] = (a + (result[di + 3] / 255) * ia) * 255;
    }
  }
}

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

// Oracle: down-right just outside the square the shadow is red; up-left outside the square is empty.
const SHADOW_X = SQUARE_MIN + SQUARE + 6; // just past the right edge, inside the shadow band
const SHADOW_Y = SQUARE_MIN + SQUARE + 6; // just past the bottom edge, inside the shadow band
const EMPTY_X = SQUARE_MIN - 12; // outside the up-left, no shadow there
const EMPTY_Y = SQUARE_MIN - 12;

export function assertRender(frame: Readonly<Surface>): void {
  if (filter.type !== 'dropShadow') {
    throw new Error('[filter-drop-shadow] expected a dropShadow filter');
  }
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const shadowPx = Math.round((RESULT_X + SHADOW_X) * s);
  const shadowPy = Math.round((TOP + SHADOW_Y) * s);
  const shadow = getSurfacePixelRgb(frame, shadowPx, shadowPy);
  const sr = (shadow >> 16) & 255;
  const sg = (shadow >> 8) & 255;
  const sb = shadow & 255;
  if (sr <= 120 || sg > 96 || sb > 96) {
    throw new Error(`[filter-drop-shadow] expected red shadow down-right of the square, got #${hex(shadow)}`);
  }

  const emptyPx = Math.round((RESULT_X + EMPTY_X) * s);
  const emptyPy = Math.round((TOP + EMPTY_Y) * s);
  const empty = getSurfacePixelRgb(frame, emptyPx, emptyPy);
  if (!channelsClose(empty, 0x000000)) {
    throw new Error(`[filter-drop-shadow] expected no shadow up-left of the square, got #${hex(empty)}`);
  }
}

function channelsClose(a: number, b: number, tol = 24): boolean {
  return (
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= tol &&
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= tol &&
    Math.abs((a & 255) - (b & 255)) <= tol
  );
}

function hex(rgb: number): string {
  return rgb.toString(16).padStart(6, '0');
}
