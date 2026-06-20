// filter-bevel-inner — validates an inner BevelFilter on a centered gray square.
//
// Surface-based filter pattern: build a known source surface, apply the filter ONCE via
// applyBevelFilterToSurface, composite the resulting bevel mask OVER the source, then blit
// source | result 1:1 as bitmaps. The filter math runs on the surface in JS, so every backend
// draws identical bytes. The bevel writes a tinted edge MASK (highlight where the alpha gradient
// faces the light, shadow on the opposite edge), which we composite over the original source per
// the surface JSDoc. Light points down-right (angle 45°), so the inner edge gradient lights the
// bottom-right edge (highlight) and shades the top-left edge (shadow) of the square.
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
const SQUARE = 96;
const INSET = (TILE - SQUARE) / 2; // centered square: x/y in [80, 176)
const SOURCE_X = 120;
const RESULT_X = 424;

// Centered opaque mid-gray square on a TRANSPARENT field. The bevel is derived from the
// directional gradient of the source's blurred ALPHA (see applySurfaceBevelFilter), so the
// square must carry the only alpha edge in the surface — an opaque square on opaque black has a
// uniform alpha field and yields no bevel at all.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, INSET, INSET, SQUARE, SQUARE), 0x808080ff);

// Inner bevel: writes a tinted edge mask. Composite it over a copy of the source.
const filter = createBevelFilter({
  bevelType: 'inner',
  angle: 45,
  distance: 6,
  blurX: 4,
  blurY: 4,
  highlightColor: 0xffffff,
  shadowColor: 0x000000,
  strength: 2,
});

const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyBevelFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

// Composite mask (source-over) onto a copy of the source to complete the inner bevel.
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

// Sample points in the centered RESULT square, in logical (pre-scale) coordinates.
const CENTER = INSET + SQUARE / 2; // 128
const EDGE = 4; // on the inner bevel band, where the alpha gradient (offset 4 + blur 4) peaks
const TOP_LEFT_X = INSET + EDGE; // shadowed edge (gradient faces away from light)
const TOP_LEFT_Y = INSET + EDGE;
const BOTTOM_RIGHT_X = INSET + SQUARE - EDGE; // highlighted edge (gradient faces light)
const BOTTOM_RIGHT_Y = INSET + SQUARE - EDGE;

export function assertRender(frame: Readonly<Surface>): void {
  if (filter.bevelType !== 'inner') {
    throw new Error(`[filter-bevel-inner] expected bevelType 'inner', got '${String(filter.bevelType)}'`);
  }
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const center = sample(frame, s, RESULT_X + CENTER, TOP + CENTER);
  const topLeft = sample(frame, s, RESULT_X + TOP_LEFT_X, TOP + TOP_LEFT_Y);
  const bottomRight = sample(frame, s, RESULT_X + BOTTOM_RIGHT_X, TOP + BOTTOM_RIGHT_Y);

  // Inner bevel with light down-right: bottom-right inner edge is highlighted (lighter than
  // center); top-left inner edge is shadowed (darker than center).
  if (!(luma(bottomRight) > luma(center) + 12)) {
    throw new Error(
      `[filter-bevel-inner] bottom-right edge should be lighter than center: ` +
        `edge #${hex(bottomRight)} (luma ${luma(bottomRight)}) vs center #${hex(center)} (luma ${luma(center)})`,
    );
  }
  if (!(luma(topLeft) < luma(center) - 12)) {
    throw new Error(
      `[filter-bevel-inner] top-left edge should be darker than center: ` +
        `edge #${hex(topLeft)} (luma ${luma(topLeft)}) vs center #${hex(center)} (luma ${luma(center)})`,
    );
  }
  // Center should be near untouched mid-gray (mask alpha ~0 in the interior).
  if (!channelsClose(center, 0x808080, 28)) {
    throw new Error(`[filter-bevel-inner] center expected ~#808080, got #${hex(center)}`);
  }
}

function sample(frame: Readonly<Surface>, s: number, x: number, y: number): number {
  return getSurfacePixelRGB(frame, Math.round(x * s), Math.round(y * s));
}

function luma(rgb: number): number {
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
