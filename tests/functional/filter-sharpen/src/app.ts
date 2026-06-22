// filter-sharpen — validates SharpenFilter (unsharp mask) on a known soft-step source.
//
// Reference for the surface-based filter suite: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle checks the
// filter's defining behaviour on pixels we chose, instead of eyeballing a busy scene.
//
// Source: a vertical soft step. Left half is mid-gray (0x80), right half is lighter (0xb0), joined by an
// 8px linear ramp centred on the seam so the transition is gradual rather than a hard edge. Sharpen
// (unsharp mask) increases edge contrast: it overshoots near the seam — the darker side dips below 0x80
// and the lighter side rises above 0xb0 — while the flat interiors stay ~unchanged.
import { createSharpenFilter } from '@flighthq/filters';
import { applySharpenFilterToSurface } from '@flighthq/filters-surface';
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
const HALF = TILE / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

const DARK = 0x80; // flat left value
const LIGHT = 0xb0; // flat right value
const RAMP = 8; // ramp width in pixels, centred on the seam
const RAMP_X0 = HALF - RAMP / 2; // first ramp column

function grayColor(level: number): number {
  return ((level & 0xff) * 0x01010100) | 0xff; // packed RGBA, opaque gray
}

// Soft vertical step: dark left half, light right half, with an 8px linear ramp across the seam.
const source = createSurface(TILE, TILE, grayColor(DARK));
fillSurfaceRectangle(createSurfaceRegion(source, HALF, 0, HALF, TILE), grayColor(LIGHT));
for (let i = 0; i < RAMP; i += 1) {
  const x = RAMP_X0 + i;
  const t = (i + 1) / (RAMP + 1);
  const level = Math.round(DARK + (LIGHT - DARK) * t);
  for (let y = 0; y < TILE; y += 1) setSurfacePixel(source, x, y, grayColor(level));
}

const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
const result = new Uint8ClampedArray(TILE * TILE * 4);
applySharpenFilterToSurface(
  result,
  blurBuffer,
  createSurfaceRegion(source),
  createSharpenFilter({ blurX: 4, blurY: 4, amount: 1 }),
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

// Oracle: sharpen overshoots at the seam (dark side dips below 0x80, light side rises above 0xb0) while
// the flat interiors stay close to their source values. Sample a band well away from the top/bottom edges
// to avoid vertical-blur boundary effects.
const SAMPLE_Y = HALF; // mid-height of the tile
const DARK_OVERSHOOT_X = RAMP_X0 - 2; // just left of the ramp (dark side of the edge)
const LIGHT_OVERSHOOT_X = HALF + RAMP / 2 + 2; // just right of the ramp (light side of the edge)
const FLAT_DARK_X = 32; // deep in the flat dark interior
const FLAT_LIGHT_X = TILE - 32; // deep in the flat light interior

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  if (channel(sample(frame, FLAT_DARK_X, s)) > DARK + 8) {
    throw new Error(
      `[filter-sharpen] flat dark interior changed: expected ~${DARK}, got ${channel(sample(frame, FLAT_DARK_X, s))}`,
    );
  }
  if (channel(sample(frame, FLAT_LIGHT_X, s)) < LIGHT - 8) {
    throw new Error(
      `[filter-sharpen] flat light interior changed: expected ~${LIGHT}, got ${channel(sample(frame, FLAT_LIGHT_X, s))}`,
    );
  }

  const darkEdge = channel(sample(frame, DARK_OVERSHOOT_X, s));
  if (darkEdge >= DARK) {
    throw new Error(`[filter-sharpen] dark side did not undershoot: expected < ${DARK}, got ${darkEdge}`);
  }

  const lightEdge = channel(sample(frame, LIGHT_OVERSHOOT_X, s));
  if (lightEdge <= LIGHT) {
    throw new Error(`[filter-sharpen] light side did not overshoot: expected > ${LIGHT}, got ${lightEdge}`);
  }
}

function sample(frame: Readonly<Surface>, tileX: number, s: number): number {
  const px = Math.round((RESULT_X + tileX) * s);
  const py = Math.round((TOP + SAMPLE_Y) * s);
  return getSurfacePixelRgb(frame, px, py);
}

function channel(rgb: number): number {
  return rgb & 0xff; // gray: all channels equal, read blue
}
