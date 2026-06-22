// filter-displacement-map-ignore — validates DisplacementMapFilter in 'ignore' mode on a known source.
//
// Reference for the surface-based filter suite: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle checks the
// filter's defining behavior on pixels we chose, instead of eyeballing a busy scene.
//
// 'ignore' mode: when a displaced sample position falls outside the source, the ORIGINAL undisplaced
// source pixel is retained (not the 'color' fill). The map drives every pixel +20px to the right
// (componentX=0, scaleX=40, map R=255). The right-edge band's samples land off the right edge, so under
// 'ignore' those output pixels keep their original colour — distinct from the black fill 'color' would write.
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
  getSurfacePixelRgb,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const SOURCE_X = 120;
const RESULT_X = 424;
const EDGE = 20; // right-edge band width (pixels pushed off the right edge by the +20px shift)

// Source: green field with a distinctive blue right-edge band.
const source = createSurface(TILE, TILE, 0x00ff00ff);
fillSurfaceRectangle(createSurfaceRegion(source, TILE - EDGE, 0, EDGE, TILE), 0x0000ffff);

// Displacement map: R channel = 255 everywhere → componentX shift of +0.5×scaleX = +20px to the right.
const map = createSurface(TILE, TILE, 0xff0000ff);

// 'ignore' mode keeps the original source pixel where the +20px sample lands out of bounds (right band).
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyDisplacementMapFilterToSurface(
  result,
  createSurfaceRegion(source),
  createSurfaceRegion(map),
  createDisplacementMapFilter({ mode: 'ignore', componentX: 0, scaleX: 40 }),
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

// Oracle: in the right-edge band the +20px sample falls out of bounds, so 'ignore' retains the original
// blue pixel (NOT the black 'color' fill). The interior shifts +20px within bounds and stays green.
const EXPECT = [
  { lx: TILE - EDGE / 2, ly: TILE / 2, rgb: 0x0000ff }, // right-edge band: original blue retained
  { lx: TILE / 2, ly: TILE / 2, rgb: 0x00ff00 }, // interior: in-bounds shift stays green
];

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  for (const { lx, ly, rgb } of EXPECT) {
    const px = Math.round((RESULT_X + lx) * s);
    const py = Math.round((TOP + ly) * s);
    const got = getSurfacePixelRgb(frame, px, py);
    if (!channelsClose(got, rgb)) {
      throw new Error(`[filter-displacement-map-ignore] sample (${lx},${ly}) expected #${hex(rgb)}, got #${hex(got)}`);
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
