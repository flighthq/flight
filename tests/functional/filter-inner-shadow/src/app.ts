// filter-inner-shadow — validates InnerShadowFilter on a centered white square.
//
// Surface-based filter test: build a known source surface, produce the inner-shadow MASK once via
// applyInnerShadowFilterToSurface, composite the original source then the mask on top (the inner
// shadow hugs the inside of the shape boundary), then blit source | result 1:1 as bitmaps. The
// filter math runs on the surface in JS, so every backend draws identical bytes — exact
// cross-backend parity — and the oracle checks the defining effect: a dark band appears just inside
// the shape's edges while the center stays bright. (The surface path centers the shadow on the
// boundary; `angle`/`distance` are not yet applied, so the shadow rings all four inner edges.)
import { createInnerShadowFilter } from '@flighthq/filters';
import { applyInnerShadowFilterToSurface } from '@flighthq/filters-surface';
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
const SQUARE = 160;
const SQUARE_X = (TILE - SQUARE) / 2;
const SQUARE_Y = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a centered opaque-white square on transparent black (packed RGBA).
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);

// Produce the inner-shadow mask, then composite: source first, mask (source-over) on top.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyInnerShadowFilterToSurface(
  mask,
  blurBuffer,
  createSurfaceRegion(source),
  createInnerShadowFilter({ distance: 8, angle: 45, color: 0x000000, blurX: 4, blurY: 4, strength: 1 }),
);

const result = new Uint8ClampedArray(TILE * TILE * 4);
result.set(source.data.subarray(0, TILE * TILE * 4));
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

// Oracle: the result square is bright at its center but notably darker just inside its edges, where
// the inner shadow rings the boundary. Sample a center point and an edge-interior point.
const CENTER_X = SQUARE_X + SQUARE / 2;
const CENTER_Y = SQUARE_Y + SQUARE / 2;
const EDGE_X = SQUARE_X + 2; // just inside the top-left corner — within the narrow shadow band
const EDGE_Y = SQUARE_Y + 2;

export function assertRender(frame: Readonly<Surface>): void {
  const f = createInnerShadowFilter({
    distance: 8,
    angle: 45,
    color: 0x000000,
    blurX: 4,
    blurY: 4,
    strength: 1,
  });
  if (f.type !== 'innerShadow') {
    throw new Error(`[filter-inner-shadow] expected an innerShadow filter, got #${String(f.type)}`);
  }

  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  const center = getSurfacePixelRgb(frame, sx(CENTER_X, s), sy(CENTER_Y, s));
  const edge = getSurfacePixelRgb(frame, sx(EDGE_X, s), sy(EDGE_Y, s));

  // The center stays bright (near white).
  if (!channelsClose(center, 0xffffff, 40)) {
    throw new Error(`[filter-inner-shadow] center expected near-white, got #${hex(center)}`);
  }
  // The inner edge is notably darkened by the shadow.
  if (luminance(edge) > luminance(center) - 64) {
    throw new Error(`[filter-inner-shadow] inner edge #${hex(edge)} not notably darker than center #${hex(center)}`);
  }
}

function compositeOver(dest: Uint8ClampedArray, src: Uint8ClampedArray): void {
  for (let i = 0; i < dest.length; i += 4) {
    const sa = src[i + 3] / 255;
    if (sa === 0) continue;
    const ia = 1 - sa;
    dest[i] = Math.round(src[i] * sa + dest[i] * ia);
    dest[i + 1] = Math.round(src[i + 1] * sa + dest[i + 1] * ia);
    dest[i + 2] = Math.round(src[i + 2] * sa + dest[i + 2] * ia);
    dest[i + 3] = Math.min(255, src[i + 3] + Math.round(dest[i + 3] * ia));
  }
}

function sx(x: number, s: number): number {
  return Math.round((RESULT_X + x) * s);
}

function sy(y: number, s: number): number {
  return Math.round((TOP + y) * s);
}

function luminance(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255);
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
