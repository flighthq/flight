// filter-blur — validates BlurFilter on a hard-edged white square over black.
//
// Reference for the surface-based filter suite: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity. The oracle checks the defining
// property of a Gaussian blur on pixels we chose: the hard step from black→white becomes a gradient that
// bleeds outside the original square while the centre stays bright.
import { applyBlurFilterToSurface, createBlurFilter } from '@flighthq/filters';
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
const SQUARE_MIN = (TILE - SQUARE) / 2; // 64
const SQUARE_MAX = SQUARE_MIN + SQUARE; // 192
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: black tile with a centred 128×128 opaque-white square (packed RGBA).
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);

// Gaussian blur, 8px on each axis. blur takes an extra blurBuffer scratch arg.
const result = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyBlurFilterToSurface(result, blurBuffer, createSurfaceRegion(source), createBlurFilter({ blurX: 8, blurY: 8 }));

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

// Oracle, sampling the RESULT tile in logical coordinates:
//   centre   — still bright (the square's core survives the blur)
//   edge     — the former hard boundary is now intermediate grey (the step became a gradient)
//   outside  — a few px beyond the original edge is no longer black (light bled outward)
const CENTRE = TILE / 2; // 128
const EDGE = SQUARE_MAX; // 192, the former hard right edge
const OUTSIDE = SQUARE_MAX + 6; // 198, just outside the original square where σ=8 bleed is clear

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const centre = green(getSurfacePixelRgb(frame, sx(CENTRE, s), sy(CENTRE, s)));
  if (centre <= 200) {
    throw new Error(`[filter-blur] centre expected bright (>200), got ${centre}`);
  }

  const edge = green(getSurfacePixelRgb(frame, sx(EDGE, s), sy(CENTRE, s)));
  if (edge < 40 || edge > 220) {
    throw new Error(`[filter-blur] former edge expected intermediate (40..220), got ${edge}`);
  }

  const outside = green(getSurfacePixelRgb(frame, sx(OUTSIDE, s), sy(CENTRE, s)));
  if (outside <= 20) {
    throw new Error(`[filter-blur] outside-edge expected bleed (>20), got ${outside}`);
  }
}

function green(rgb: number): number {
  return (rgb >> 8) & 255;
}

function sx(localX: number, s: number): number {
  return Math.round((RESULT_X + localX) * s);
}

function sy(localY: number, s: number): number {
  return Math.round((TOP + localY) * s);
}
