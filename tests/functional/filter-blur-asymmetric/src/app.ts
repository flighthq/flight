// filter-blur-asymmetric — validates a horizontal-only BlurFilter (blurX: 16, blurY: 0) on a known source.
//
// Surface-based filter pattern: build a known source surface, apply the filter ONCE via
// applyBlurFilterToSurface, then blit source | result 1:1 as bitmaps. The blur math runs on the surface
// in JS, so every backend draws identical bytes. The oracle checks the defining property of an
// asymmetric blur: pixels bleed horizontally past the square's left/right edges, while the top edge —
// untouched by a zero vertical blur — stays sharp.
import { createBlurFilter } from '@flighthq/filters';
import { applyBlurFilterToSurface } from '@flighthq/filters-surface';
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

// Centered 128×128 white square on black — leaves room for horizontal bleed and a sharp top edge.
const SQUARE = 128;
const SQUARE_X = (TILE - SQUARE) / 2; // 64
const SQUARE_Y = (TILE - SQUARE) / 2; // 64
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);

// Horizontal-only Gaussian blur: blurX spreads pixels sideways, blurY = 0 leaves vertical edges crisp.
const result = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyBlurFilterToSurface(result, blurBuffer, createSurfaceRegion(source), createBlurFilter({ blurX: 16, blurY: 0 }));

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

// Sample points within the RESULT tile (logical tile coordinates):
//   centerX/centerY: middle of the square's vertical span / horizontal span.
const centerX = SQUARE_X + SQUARE / 2; // 128
const centerY = SQUARE_Y + SQUARE / 2; // 128

export function assertRender(frame: Readonly<Surface>): void {
  if ((createBlurFilter({ blurX: 16, blurY: 0 }) as { blurX?: number }).blurX === undefined) {
    throw new Error('[filter-blur-asymmetric] BlurFilter is missing its blurX property');
  }
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  // Horizontal bleed: 12px outside the left edge, at the square's vertical center, must be lit.
  const leftBleed = luma(sample(frame, RESULT_X + SQUARE_X - 12, TOP + centerY, s));
  if (leftBleed <= 20) {
    throw new Error(`[filter-blur-asymmetric] expected left-edge horizontal bleed (>20), got luma ${leftBleed}`);
  }

  // Horizontal bleed: 12px outside the right edge, at the square's vertical center, must be lit.
  const rightBleed = luma(sample(frame, RESULT_X + SQUARE_X + SQUARE + 12, TOP + centerY, s));
  if (rightBleed <= 20) {
    throw new Error(`[filter-blur-asymmetric] expected right-edge horizontal bleed (>20), got luma ${rightBleed}`);
  }

  // Sharp top edge: 4px above the top edge (at the square's horizontal center) stays ~background.
  const aboveTop = luma(sample(frame, RESULT_X + centerX, TOP + SQUARE_Y - 4, s));
  if (aboveTop >= 40) {
    throw new Error(`[filter-blur-asymmetric] expected sharp top edge (background <40 above), got luma ${aboveTop}`);
  }

  // Just inside the top edge must be bright — confirms the square is intact, not blurred away.
  const insideTop = luma(sample(frame, RESULT_X + centerX, TOP + SQUARE_Y + 4, s));
  if (insideTop <= 180) {
    throw new Error(
      `[filter-blur-asymmetric] expected bright interior just inside top edge (>180), got luma ${insideTop}`,
    );
  }
}

function sample(frame: Readonly<Surface>, x: number, y: number, s: number): number {
  return getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));
}

function luma(rgb: number): number {
  return Math.round(0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255));
}
