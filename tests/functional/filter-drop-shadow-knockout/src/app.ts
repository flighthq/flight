// filter-drop-shadow-knockout — validates DropShadowFilter with knockout on a known source surface.
//
// Surface-based filter test: build a known source surface (an opaque white square on a transparent
// field), apply the drop shadow ONCE via applyDropShadowFilterToSurface, then composite ONLY the
// tinted blurred shadow mask at the shadow offset — the source square is omitted because
// knockout: true. The filter math runs on the surface in JS, so every backend draws identical bytes.
// The oracle checks knockout's defining behavior: the red shadow is present down-right outside the
// square, and the square's own footprint is NOT the white source (knocked out).
import { applyDropShadowFilterToSurface, createDropShadowFilter, getShadowFilterOffset } from '@flighthq/filters';
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
const SQUARE_X = (TILE - SQUARE) / 2; // 80 — square spans [80, 176) on both axes
const SQUARE_Y = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: opaque white square centered on a fully transparent field. The shadow is derived from the
// square's alpha, so the transparent surround keeps the resulting shadow mask localized.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);

const filter = createDropShadowFilter({
  distance: 14,
  angle: 45,
  color: 0xff0000,
  blurX: 4,
  blurY: 4,
  knockout: true,
});

// Drop shadow writes the tinted blurred alpha mask at the source's own position. To complete the
// effect, composite that mask at the shadow offset; with knockout: true, the source is omitted.
const { dx, dy } = getShadowFilterOffset(filter);
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyDropShadowFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

// Composite the offset shadow mask into the result over a transparent field (knockout: no source).
const result = new Uint8ClampedArray(TILE * TILE * 4);
for (let y = 0; y < TILE; y++) {
  const sy = y - dy;
  if (sy < 0 || sy >= TILE) continue;
  for (let x = 0; x < TILE; x++) {
    const sx = x - dx;
    if (sx < 0 || sx >= TILE) continue;
    const si = (sy * TILE + sx) * 4;
    const di = (y * TILE + x) * 4;
    result[di] = mask[si];
    result[di + 1] = mask[si + 1];
    result[di + 2] = mask[si + 2];
    result[di + 3] = mask[si + 3];
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

// Oracle: the red shadow lands down-right of the square's footprint, and the square's own area is
// not the white source. Background is opaque black (0xff000000), so a knocked-out square reads black.
const SHADOW_RGB = 0xff0000; // red shadow
const SQUARE_CENTER_X = SQUARE_X + SQUARE / 2; // 128
const SQUARE_CENTER_Y = SQUARE_Y + SQUARE / 2; // 128
// A point just past the square's bottom-right corner (176) that the offset shadow (square shifted
// to [90,186)) still covers with its opaque red core.
const SHADOW_X = 179;
const SHADOW_Y = 179;

export function assertRender(frame: Readonly<Surface>): void {
  if (filter.knockout !== true) {
    throw new Error('[filter-drop-shadow-knockout] DropShadowFilter.knockout is not set');
  }
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const shadowPx = Math.round((RESULT_X + SHADOW_X) * s);
  const shadowPy = Math.round((TOP + SHADOW_Y) * s);
  const shadow = getSurfacePixelRgb(frame, shadowPx, shadowPy);
  if (!channelsClose(shadow, SHADOW_RGB, 40)) {
    throw new Error(
      `[filter-drop-shadow-knockout] expected red shadow #${hex(SHADOW_RGB)} down-right of the square, got #${hex(shadow)}`,
    );
  }

  // The square's own footprint must NOT be the white source: knockout omits the source object.
  const squarePx = Math.round((RESULT_X + SQUARE_CENTER_X) * s);
  const squarePy = Math.round((TOP + SQUARE_CENTER_Y) * s);
  const square = getSurfacePixelRgb(frame, squarePx, squarePy);
  if (channelsClose(square, 0xffffff, 32)) {
    throw new Error(`[filter-drop-shadow-knockout] square area should be knocked out, but read white #${hex(square)}`);
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
