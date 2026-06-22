// filter-pixelate — validates PixelateFilter (blockSize 16) on a smooth horizontal gradient.
//
// Surface-based filter pattern: build a known source surface, apply the filter ONCE via
// applyPixelateFilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the
// surface in JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle
// checks the defining behavior on pixels we chose: each 16×16 block flattens to a single color, so all
// pixels inside one block are equal while an adjacent block steps to a different value.
import { applyPixelateFilterToSurface, createPixelateFilter } from '@flighthq/filters';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createSurface,
  createSurfaceRegion,
  getSurfacePixelRgb,
  setSurfacePixel,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const TILE = 256;
const SOURCE_X = 120;
const RESULT_X = 424;
const BLOCK = 16;

// Smooth horizontal gradient: R=G=B ramp 0..255 left to right, opaque. Each column is one grey level.
const source = createSurface(TILE, TILE, 0x000000ff);
for (let x = 0; x < TILE; x++) {
  const v = Math.round((x / (TILE - 1)) * 255);
  const rgba = (v << 24) | (v << 16) | (v << 8) | 0xff;
  for (let y = 0; y < TILE; y++) {
    setSurfacePixel(source, x, y, rgba >>> 0);
  }
}

const result = new Uint8ClampedArray(TILE * TILE * 4);
applyPixelateFilterToSurface(result, createSurfaceRegion(source), createPixelateFilter({ blockSize: BLOCK }));

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

// Oracle: pick a block (block index 4 → columns 64..79) and sample several interior pixels; all must be
// equal (uniform flat color). Then sample the adjacent block (index 5 → columns 80..95); its flat color
// must differ from the first, proving the gradient steps block-to-block instead of staying smooth.
const BLOCK_A = 4; // tile-local x range 64..79
const BLOCK_B = 5; // tile-local x range 80..95

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  // Several interior samples within block A must all be equal (within tolerance).
  const aLocals = [
    [BLOCK_A * BLOCK + 2, 40],
    [BLOCK_A * BLOCK + 7, 120],
    [BLOCK_A * BLOCK + 13, 200],
  ];
  const aValues = aLocals.map(([lx, ly]) => sampleResult(frame, s, lx, ly));
  for (let i = 1; i < aValues.length; i++) {
    if (!channelsClose(aValues[0], aValues[i], 4)) {
      throw new Error(`[filter-pixelate] block ${BLOCK_A} not uniform: #${hex(aValues[0])} vs #${hex(aValues[i])}`);
    }
  }

  // Adjacent block B must flatten to a different value (the gradient steps).
  const bValue = sampleResult(frame, s, BLOCK_B * BLOCK + 7, 120);
  if (channelsClose(aValues[0], bValue, 4)) {
    throw new Error(
      `[filter-pixelate] adjacent blocks did not step: block ${BLOCK_A} #${hex(aValues[0])} == block ${BLOCK_B} #${hex(bValue)}`,
    );
  }
}

function sampleResult(frame: Readonly<Surface>, s: number, localX: number, localY: number): number {
  const px = Math.round((RESULT_X + localX) * s);
  const py = Math.round((TOP + localY) * s);
  return getSurfacePixelRgb(frame, px, py);
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
