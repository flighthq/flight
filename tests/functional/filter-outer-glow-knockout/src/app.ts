// filter-outer-glow-knockout — validates OuterGlowFilter with knockout on a centered white square.
//
// Surface-based filter pattern (see filter-color-matrix): build a known source surface, apply the
// filter ONCE via apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math
// runs on the surface in JS, so every backend draws identical bytes — exact cross-backend parity.
//
// outerGlow writes a tinted, blurred alpha MASK of the source silhouette. Normally we composite the
// mask first then the source on top; with knockout: true the source is OMITTED, so the result is the
// glow mask alone. The result tile shows a green glow ring spilling outside the square's edges, and
// the square area is filled by the glow's tinted core — green, NOT the white of the source.
import { applyOuterGlowFilterToSurface, createOuterGlowFilter } from '@flighthq/filters';
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
const SQUARE = 96;
const SQUARE_X = (TILE - SQUARE) / 2;
const SQUARE_Y = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a centered opaque white square on transparent black.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);

// Glow mask: green tint, blurred silhouette. With knockout the result is the mask alone.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyOuterGlowFilterToSurface(
  mask,
  blurBuffer,
  createSurfaceRegion(source),
  createOuterGlowFilter({ color: 0x00ff00, blurX: 8, blurY: 8, strength: 2, knockout: true }),
);

// Knockout composites only the glow over the opaque black tile background; the source is omitted.
const result = new Uint8ClampedArray(TILE * TILE * 4);
for (let i = 0; i < result.length; i += 4) {
  const ma = mask[i + 3] / 255;
  for (let c = 0; c < 3; c++) {
    result[i + c] = Math.round(mask[i + c] * ma); // glow color over black (0)
  }
  result[i + 3] = 255;
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

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const glowF = createOuterGlowFilter({
    color: 0x00ff00,
    blurX: 8,
    blurY: 8,
    strength: 2,
    knockout: true,
  });
  if (glowF.knockout !== true) {
    throw new Error('[filter-outer-glow-knockout] expected outerGlow filter to carry knockout=true');
  }

  // Knockout omits the source: the square center must NOT be the source white.
  const cx = Math.round((RESULT_X + TILE / 2) * s);
  const cy = Math.round((TOP + TILE / 2) * s);
  const center = getSurfacePixelRGB(frame, cx, cy);
  if (channelsClose(center, 0xffffff, 24)) {
    throw new Error(
      `[filter-outer-glow-knockout] square center should not be white (source knocked out), got #${hex(center)}`,
    );
  }
  // The knocked-out core is filled by the green glow tint: green dominant, no red/blue.
  if (((center >> 8) & 255) <= 100 || ((center >> 16) & 255) > 100 || (center & 255) > 100) {
    throw new Error(`[filter-outer-glow-knockout] square center expected green glow, got #${hex(center)}`);
  }

  // Just outside each edge (~2px) the green glow ring must be green-dominant: the
  // blurred glow falls off with distance, so sample near the edge where it is strongest.
  const off = 2;
  const edges: ReadonlyArray<readonly [number, number]> = [
    [TILE / 2, SQUARE_Y - off], // above top edge
    [TILE / 2, SQUARE_Y + SQUARE + off], // below bottom edge
    [SQUARE_X - off, TILE / 2], // left of left edge
    [SQUARE_X + SQUARE + off, TILE / 2], // right of right edge
  ];
  for (const [lx, ly] of edges) {
    const px = Math.round((RESULT_X + lx) * s);
    const py = Math.round((TOP + ly) * s);
    const got = getSurfacePixelRGB(frame, px, py);
    const r = (got >> 16) & 255;
    const g = (got >> 8) & 255;
    const b = got & 255;
    // Green must clearly dominate the ring: present (G high) and tinted, not white/gray.
    if (g <= 100 || r > g - 40 || b > g - 40) {
      throw new Error(
        `[filter-outer-glow-knockout] glow ring missing at (${lx},${ly}); expected green, got #${hex(got)}`,
      );
    }
  }

  // Far background (tile corner) stays black — the glow does not reach it.
  const bx = Math.round((RESULT_X + 8) * s);
  const by = Math.round((TOP + 8) * s);
  const bg = getSurfacePixelRGB(frame, bx, by);
  if (!channelsClose(bg, 0x000000, 24)) {
    throw new Error(`[filter-outer-glow-knockout] far background expected black, got #${hex(bg)}`);
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
