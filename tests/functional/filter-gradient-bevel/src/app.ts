// filter-gradient-bevel — validates a GradientBevelFilter on a centered gray square.
//
// Surface-based filter pattern: build a known source surface, apply the filter ONCE via
// applyGradientBevelFilterToSurface, composite the resulting bevel mask OVER the source, then blit
// source | result 1:1 as bitmaps. The filter math runs on the surface in JS, so every backend
// draws identical bytes. The gradient bevel writes a tinted edge MASK whose color is sampled from
// the gradient ramp (colors[0] near one bevel edge, colors[last] near the opposite edge), which we
// composite over the original source per the surface JSDoc. The ramp runs red → gray → blue, so
// with light down-right (angle 45°) the gradient endpoints land on opposite inner edges: red near
// the top-left edge and blue near the bottom-right edge.
import { applyGradientBevelFilterToSurface, createGradientBevelFilter } from '@flighthq/filters';
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
const INSET = (TILE - SQUARE) / 2; // centered square: x/y in [80, 176)
const SOURCE_X = 120;
const RESULT_X = 424;

// Centered opaque mid-gray square on a TRANSPARENT field. The gradient bevel reads the source
// ALPHA channel to find edges, so the square must be the only opaque content — an opaque background
// would leave the alpha field flat and the bevel would collapse to the ramp midpoint (flat gray).
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, INSET, INSET, SQUARE, SQUARE), 0x808080ff);

// Inner gradient bevel: writes a tinted edge mask sampled from a red → gray → blue ramp.
// Composite it over a copy of the source to complete the effect.
const filter = createGradientBevelFilter({
  bevelType: 'inner',
  colors: [0xff0000, 0x808080, 0x0000ff],
  alphas: [1, 1, 1],
  ratios: [0, 128, 255],
  angle: 45,
  distance: 8,
  blurX: 4,
  blurY: 4,
  strength: 2,
});

const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyGradientBevelFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

// Composite mask (source-over) onto a copy of the source to complete the gradient bevel.
const result = new Uint8ClampedArray(source.data);
for (let i = 0; i < result.length; i += 4) {
  const ma = mask[i + 3] / 255;
  if (ma === 0) continue;
  const inv = 1 - ma;
  result[i] = mask[i] * ma + result[i] * inv;
  result[i + 1] = mask[i + 1] * ma + result[i + 1] * inv;
  result[i + 2] = mask[i + 2] * ma + result[i + 2] * inv;
  result[i + 3] = mask[i + 3] + result[i + 3] * inv;
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

// Sample points along the inner edges of the centered RESULT square, in logical coordinates.
// Scan a short band on each diagonal edge for the strongest gradient-endpoint pixel, since the
// tinted bevel edge is a thin soft band rather than a single pixel.
const EDGE = 8; // a few px in from each inner corner along the diagonal
const TOP_LEFT_X = INSET + EDGE; // ramp start (red) edge
const TOP_LEFT_Y = INSET + EDGE;
const BOTTOM_RIGHT_X = INSET + SQUARE - EDGE; // ramp end (blue) edge
const BOTTOM_RIGHT_Y = INSET + SQUARE - EDGE;

export function assertRender(frame: Readonly<Surface>): void {
  if (filter.type !== 'gradientBevel') {
    throw new Error(`[filter-gradient-bevel] expected a gradientBevel filter, got '${String(filter.type)}'`);
  }
  if (!Array.isArray(filter.colors) || filter.colors.length === 0) {
    throw new Error('[filter-gradient-bevel] gradient bevel filter is missing its colors ramp');
  }
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const redEdge = scanReddest(frame, s, RESULT_X + TOP_LEFT_X, TOP + TOP_LEFT_Y);
  const blueEdge = scanBluest(frame, s, RESULT_X + BOTTOM_RIGHT_X, TOP + BOTTOM_RIGHT_Y);

  // Ramp start (red, 0xff0000) lands on the top-left inner edge: strong red, weak blue.
  const rr = (redEdge >> 16) & 255;
  const rb = redEdge & 255;
  if (!(rr > 120 && rb < 110)) {
    throw new Error(`[filter-gradient-bevel] top-left edge should be red (R>120, B<110), got #${hex(redEdge)}`);
  }

  // Ramp end (blue, 0x0000ff) lands on the bottom-right inner edge: strong blue, weak red.
  const br = (blueEdge >> 16) & 255;
  const bb = blueEdge & 255;
  if (!(bb > 120 && br < 110)) {
    throw new Error(`[filter-gradient-bevel] bottom-right edge should be blue (B>120, R<110), got #${hex(blueEdge)}`);
  }
}

// Walk a short diagonal band around (cx, cy) and return the most-red / most-blue sample, so a thin
// tinted edge that drifts a pixel or two between backends is still caught.
function scanReddest(frame: Readonly<Surface>, s: number, cx: number, cy: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let d = -6; d <= 6; d++) {
    const rgb = getSurfacePixelRGB(frame, Math.round((cx + d) * s), Math.round((cy + d) * s));
    const score = ((rgb >> 16) & 255) - (rgb & 255);
    if (score > bestScore) {
      bestScore = score;
      best = rgb;
    }
  }
  return best;
}

function scanBluest(frame: Readonly<Surface>, s: number, cx: number, cy: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let d = -6; d <= 6; d++) {
    const rgb = getSurfacePixelRGB(frame, Math.round((cx + d) * s), Math.round((cy + d) * s));
    const score = (rgb & 255) - ((rgb >> 16) & 255);
    if (score > bestScore) {
      bestScore = score;
      best = rgb;
    }
  }
  return best;
}

function hex(rgb: number): string {
  return rgb.toString(16).padStart(6, '0');
}
