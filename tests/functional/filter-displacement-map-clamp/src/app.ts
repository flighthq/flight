// filter-displacement-map-clamp — validates DisplacementMapFilter (componentX=red, scaleX=30, mode='clamp')
// warping a coarse vertical-stripe source by a horizontal red ramp.
//
// Surface-based filter pattern: build a known source surface and a known map surface, apply the filter
// ONCE via applyDisplacementMapFilterToSurface, then blit source | result 1:1 as bitmaps. The warp math
// runs on the surface in JS, so every backend draws identical bytes — exact cross-backend parity. The map
// is a red ramp 0..255 left→right, so dx = (red/255 − 0.5) × 30: the left edge shifts −15px and the right
// edge +15px. Two oracle facts: a stripe edge moves (a column that was black becomes white), and at the
// right edge out-of-range samples CLAMP to the border column (black) instead of wrapping to white garbage.
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
  setSurfacePixel,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const STRIPE = 16;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: coarse vertical stripes — alternating white / black columns in STRIPE-wide blocks (opaque).
const source = createSurface(TILE, TILE, 0x000000ff);
for (let c = 0; c < TILE; c++) {
  if (Math.floor(c / STRIPE) % 2 === 0) {
    fillSurfaceRectangle(createSurfaceRegion(source, c, 0, 1, TILE), 0xffffffff);
  }
}

// Map: horizontal red ramp, red = round(px / (TILE − 1) × 255), 0 at left → 255 at right. Green/blue 0,
// alpha opaque. componentX reads red, so dx runs −15px (left) → 0 (center) → +15px (right) at scaleX=30.
const map = createSurface(TILE, TILE, 0x000000ff);
for (let px = 0; px < TILE; px++) {
  const red = Math.round((px / (TILE - 1)) * 255);
  const color = (red << 24) | 0x000000ff;
  for (let py = 0; py < TILE; py++) {
    setSurfacePixel(map, px, py, color >>> 0);
  }
}

const filter = createDisplacementMapFilter({ mode: 'clamp', componentX: 0, scaleX: 30 });
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

// Oracle samples the RESULT tile at its vertical center (stripes are constant vertically; scaleY=0).
// SHIFTED_COL: source column 24 is black (block 1), but the −13px warp samples back into the white block,
//   so the result there is white — proof the stripe edge moved.
// CLAMP_COL: source column 252 is black; at the right edge the +15px shift runs past the tile, so 'clamp'
//   holds the border (black). Under 'wrap' it would sample a white block — testing black pins clamp.
const ROW = TILE / 2;
const SHIFTED_COL = 24;
const CLAMP_COL = 252;
const WHITE = 0xffffff;
const BLACK = 0x000000;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)
  if (filter.mode !== 'clamp') {
    throw new Error(`[filter-displacement-map-clamp] expected mode 'clamp', got '${String(filter.mode)}'`);
  }

  const shifted = sampleResult(frame, s, SHIFTED_COL, ROW);
  if (!channelsClose(shifted, WHITE)) {
    throw new Error(
      `[filter-displacement-map-clamp] shifted stripe at col ${SHIFTED_COL} expected white #${hex(WHITE)} ` +
        `(source there is black), got #${hex(shifted)} — warp did not move the stripe`,
    );
  }

  const clamped = sampleResult(frame, s, CLAMP_COL, ROW);
  if (!channelsClose(clamped, BLACK)) {
    throw new Error(
      `[filter-displacement-map-clamp] clamp border at col ${CLAMP_COL} expected black #${hex(BLACK)}, ` +
        `got #${hex(clamped)} — out-of-range sample wrapped instead of clamping`,
    );
  }
}

// Reads the RESULT tile at logical (col, row), mapped to device pixels.
function sampleResult(frame: Readonly<Surface>, s: number, col: number, row: number): number {
  const px = Math.round((RESULT_X + col) * s);
  const py = Math.round((TOP + row) * s);
  return getSurfacePixelRgb(frame, px, py);
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
