// filter-bevel-full — validates a full BevelFilter on a centered mid-gray square.
//
// Surface-based filter pattern (see filter-color-matrix): build a known source surface, apply the
// filter ONCE via apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math
// runs on the surface in JS, so every backend draws identical bytes — exact cross-backend parity.
//
// A 'full' bevel writes a directional highlight/shadow MASK derived from the source alpha silhouette,
// drawn on BOTH sides of the edge (inner and outer). Light vector L = (cos(angle), sin(angle)) points
// toward the light source; the edge facing the light gets the highlight color, the opposite edge gets
// the shadow color. We composite the bevel mask over the original source. In screen space y points
// down, so angle 45° aims L down-right: the highlight lands on the BOTTOM-RIGHT edge and the shadow on
// the TOP-LEFT edge. The result tile shows a beveled gray square: dark along its top-left rim, bright
// along its bottom-right rim.
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
const SQUARE = 128;
const SQUARE_X = (TILE - SQUARE) / 2;
const SQUARE_Y = (TILE - SQUARE) / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Source: a centered opaque mid-gray square on transparent black. The opaque silhouette gives the
// bevel a hard alpha edge to derive its highlight/shadow gradient from.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0x808080ff);

// Full bevel: white highlight + black shadow on both sides of the edge. Composite mask over source.
const BEVEL = createBevelFilter({
  bevelType: 'full',
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
applyBevelFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), BEVEL);

// Composite: result = source, then mask source-over on top (straight-alpha over).
const result = new Uint8ClampedArray(TILE * TILE * 4);
const src = source.data;
for (let i = 0; i < result.length; i += 4) {
  const sa = src[i + 3] / 255;
  const ma = mask[i + 3] / 255;
  const outA = ma + sa * (1 - ma);
  for (let c = 0; c < 3; c++) {
    const sc = src[i + c];
    const mc = mask[i + c];
    result[i + c] = outA > 0 ? Math.round((mc * ma + sc * sa * (1 - ma)) / outA) : 0;
  }
  result[i + 3] = Math.round(outA * 255);
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

  if (BEVEL.bevelType !== 'full') {
    throw new Error('[filter-bevel-full] expected bevel filter to carry bevelType "full"');
  }

  // Square center: untouched mid-gray (the bevel only paints near the edges).
  const cx = Math.round((RESULT_X + TILE / 2) * s);
  const cy = Math.round((TOP + TILE / 2) * s);
  const center = getSurfacePixelRGB(frame, cx, cy);
  if (!channelsClose(center, 0x808080, 32)) {
    throw new Error(`[filter-bevel-full] square center expected mid-gray, got #${hex(center)}`);
  }
  const centerLuma = luma(center);

  // The bevel band straddles each edge over a few pixels. Scan a short strip just inside the rim
  // (so the source silhouette is present and the band is real) and take the extreme: the highlight
  // strip's brightest pixel, the shadow strip's darkest. A broken/colorless bevel leaves these at
  // mid-gray and fails the thresholds below, so the check stays strict.
  const INSET = 6;

  // Bottom-right edge (highlight side): brighter than the gray center.
  const highlight = brightestAlongRow(
    frame,
    s,
    RESULT_X + SQUARE_X,
    RESULT_X + SQUARE_X + SQUARE,
    TOP + SQUARE_Y + SQUARE - INSET,
  );
  if (luma(highlight) <= centerLuma + 24) {
    throw new Error(
      `[filter-bevel-full] bottom-right edge expected highlight brighter than center #${hex(center)}, got #${hex(highlight)}`,
    );
  }

  // Top-left edge (shadow side): darker than the gray center.
  const shadow = darkestAlongRow(frame, s, RESULT_X + SQUARE_X, RESULT_X + SQUARE_X + SQUARE, TOP + SQUARE_Y + INSET);
  if (luma(shadow) >= centerLuma - 24) {
    throw new Error(
      `[filter-bevel-full] top-left edge expected shadow darker than center #${hex(center)}, got #${hex(shadow)}`,
    );
  }
}

function brightestAlongRow(frame: Readonly<Surface>, s: number, fromX: number, toX: number, atY: number): number {
  const y = Math.round(atY * s);
  let best = 0x000000;
  let bestLuma = -1;
  for (let x = fromX; x <= toX; x++) {
    const px = getSurfacePixelRGB(frame, Math.round(x * s), y);
    const l = luma(px);
    if (l > bestLuma) {
      bestLuma = l;
      best = px;
    }
  }
  return best;
}

function darkestAlongRow(frame: Readonly<Surface>, s: number, fromX: number, toX: number, atY: number): number {
  const y = Math.round(atY * s);
  let best = 0xffffff;
  let bestLuma = 256;
  for (let x = fromX; x <= toX; x++) {
    const px = getSurfacePixelRGB(frame, Math.round(x * s), y);
    const l = luma(px);
    if (l < bestLuma) {
      bestLuma = l;
      best = px;
    }
  }
  return best;
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

function luma(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255);
}
