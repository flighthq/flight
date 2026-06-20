// filter-inner-glow — validates InnerGlowFilter (cyan glow) on a centered white square.
//
// Surface-based filter pattern: build a known source surface, produce the inner-glow MASK once via
// applyInnerGlowFilterToSurface, composite source-first then mask-on-top (the glow sits inside the
// shape boundary), then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle samples a
// band a few pixels inside the square's edge for the cyan tint, with the center staying near white.
import { applyInnerGlowFilterToSurface, createInnerGlowFilter } from '@flighthq/filters';
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
const SQUARE = 160;
const SQUARE_OFFSET = (TILE - SQUARE) / 2; // 48: white square centered in the 256 tile
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a centered opaque-white square on transparent black, so the inner glow has an interior edge.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_OFFSET, SQUARE_OFFSET, SQUARE, SQUARE), 0xffffffff);

// Inner glow: cyan, blur 8, strength 2 — produces a mask that sits inside the shape boundary.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyInnerGlowFilterToSurface(
  mask,
  blurBuffer,
  createSurfaceRegion(source),
  createInnerGlowFilter({ color: 0x00ffff, blurX: 8, blurY: 8, strength: 2 }),
);

// Composite: original source first, then the inner-glow mask on top (source-over).
const result = new Uint8ClampedArray(TILE * TILE * 4);
result.set(source.data);
for (let i = 0; i < result.length; i += 4) {
  const ma = mask[i + 3] / 255;
  if (ma === 0) continue;
  const inv = 1 - ma;
  result[i] = mask[i] * ma + result[i] * inv;
  result[i + 1] = mask[i + 1] * ma + result[i + 1] * inv;
  result[i + 2] = mask[i + 2] * ma + result[i + 2] * inv;
  result[i + 3] = (mask[i + 3] + result[i + 3] * inv) | 0;
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

// Oracle, sampled in the RESULT tile (filtered square):
//   - a band ~6px inside an edge carries the cyan tint: B and G high, R lower than the white center.
//   - the square center stays near white: all channels high and roughly equal.
const EDGE_INSET = 6;
const EDGE_X = SQUARE_OFFSET + EDGE_INSET; // 54: just inside the square's left edge
const EDGE_Y = TILE / 2; // vertically centered on that edge band
const CENTER = TILE / 2;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const edge = getSurfacePixelRGB(frame, Math.round((RESULT_X + EDGE_X) * s), Math.round((TOP + EDGE_Y) * s));
  const er = (edge >> 16) & 255;
  const eg = (edge >> 8) & 255;
  const eb = edge & 255;
  if (eb <= 120 || eg <= 120) {
    throw new Error(`[filter-inner-glow] edge band expected cyan tint (B>120, G>120), got #${hex(edge)}`);
  }
  if (er >= eb || er >= eg) {
    throw new Error(`[filter-inner-glow] edge band expected R below cyan G/B, got #${hex(edge)}`);
  }

  const center = getSurfacePixelRGB(frame, Math.round((RESULT_X + CENTER) * s), Math.round((TOP + CENTER) * s));
  if (!channelsClose(center, 0xffffff, 40)) {
    throw new Error(`[filter-inner-glow] square center expected near-white, got #${hex(center)}`);
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
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
