// filter-bevel-outer — validates an outer BevelFilter on a centered mid-gray square over black.
//
// Surface-based filter suite (see filter-color-matrix for the reference shape): build a known source
// surface, run the filter ONCE via applyBevelFilterToSurface, composite the returned bevel mask over
// the source, then blit source | result 1:1 as bitmaps. The bevel math runs on the surface in JS, so
// every backend draws identical bytes. An outer bevel paints a highlight and a shadow that fall just
// OUTSIDE the shape edges. The bevel is shaped from the source ALPHA gradient, so the square must sit
// on a transparent tile; an opaque tile flattens the alpha field and the outer clip (1 - sourceAlpha)
// erases the effect entirely. The light vector is (cos angle, sin angle) * distance; with angle 45 the
// white highlight lands toward the BOTTOM-RIGHT and the black shadow toward the TOP-LEFT, so the oracle
// checks the bottom-right highlight lifts the black background while the top-left shadow stays at it.
import { applyBevelFilterToSurface, createBevelFilter } from '@flighthq/filters';
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
const SQUARE = 120;
const SQUARE_X = (TILE - SQUARE) / 2;
const SQUARE_Y = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a centered opaque mid-gray square on a fully transparent tile. The square's alpha edge is
// what the outer bevel is shaped from — an opaque background would flatten the alpha field and erase
// the bevel entirely (outer clip is 1 - sourceAlpha, which is 0 everywhere when the tile is opaque).
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0x808080ff);

// Outer bevel: white highlight toward the light (bottom-right at angle 45), black shadow opposite
// (top-left), just outside the edge.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyBevelFilterToSurface(
  mask,
  blurBuffer,
  createSurfaceRegion(source),
  createBevelFilter({
    bevelType: 'outer',
    angle: 45,
    distance: 6,
    blurX: 4,
    blurY: 4,
    highlightColor: 0xffffff,
    shadowColor: 0x000000,
    strength: 2,
  }),
);

// Composite the bevel mask over the original source to complete the effect.
const result = new Uint8ClampedArray(TILE * TILE * 4);
result.set(source.data);
compositeOver(result, mask);

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

// Oracle: just outside the square's bottom-right corner the white highlight band lifts the black
// background; just outside the top-left corner the black shadow band stays at the background. The
// outer-bevel highlight/shadow asymmetry across the 45 light vector means bottom-right > top-left.
const OUTSIDE = 4; // pixels outside the square edge, within the distance+blur highlight band
const TL_X = SQUARE_X - OUTSIDE;
const TL_Y = SQUARE_Y - OUTSIDE;
const BR_X = SQUARE_X + SQUARE + OUTSIDE - 1;
const BR_Y = SQUARE_Y + SQUARE + OUTSIDE - 1;
const FAR = 8; // a corner well away from the square: untouched background

export function assertRender(frame: Readonly<Surface>): void {
  if (createBevelFilter({ bevelType: 'outer' }).bevelType !== 'outer') {
    throw new Error('[filter-bevel-outer] bevelType property is absent');
  }
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const bg = luminance(sample(frame, FAR, FAR, s));
  const topLeft = luminance(sample(frame, TL_X, TL_Y, s));
  const bottomRight = luminance(sample(frame, BR_X, BR_Y, s));

  if (bottomRight <= bg + 60) {
    throw new Error(
      `[filter-bevel-outer] outer highlight should lift bottom-right above background: ` +
        `bottom-right=${bottomRight} background=${bg}`,
    );
  }
  if (topLeft > bg + 10) {
    throw new Error(
      `[filter-bevel-outer] outer shadow side should stay near the black background: ` +
        `top-left=${topLeft} background=${bg}`,
    );
  }
  if (bottomRight <= topLeft) {
    throw new Error(
      `[filter-bevel-outer] highlight (bottom-right) must be brighter than shadow (top-left): ` +
        `bottom-right=${bottomRight} top-left=${topLeft}`,
    );
  }
}

function compositeOver(target: Uint8ClampedArray, overlay: Readonly<Uint8ClampedArray>): void {
  for (let i = 0; i < target.length; i += 4) {
    const sa = overlay[i + 3] / 255;
    if (sa === 0) continue;
    const ia = 1 - sa;
    target[i] = overlay[i] * sa + target[i] * ia;
    target[i + 1] = overlay[i + 1] * sa + target[i + 1] * ia;
    target[i + 2] = overlay[i + 2] * sa + target[i + 2] * ia;
    target[i + 3] = 255;
  }
}

function luminance(rgb: number): number {
  return Math.round(0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255));
}

function sample(frame: Readonly<Surface>, tileX: number, tileY: number, s: number): number {
  const px = Math.round((RESULT_X + tileX) * s);
  const py = Math.round((TOP + tileY) * s);
  return getSurfacePixelRGB(frame, px, py);
}
