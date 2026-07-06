// filter-convolution-sharpen — validates ConvolutionFilter (3×3 sharpen kernel) on a two-tone source.
//
// Reference for the surface-based filter suite: build a known source surface, apply the filter ONCE via
// apply*FilterToSurface, then blit source | result 1:1 as bitmaps. The filter math runs on the surface in
// JS, so every backend draws identical bytes — exact cross-backend parity — and the oracle checks the
// filter's defining behavior on pixels we chose, instead of eyeballing a busy scene.
import { createConvolutionFilter } from '@flighthq/filters';
import { applyConvolutionFilterToSurface } from '@flighthq/filters-surface';
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
const HALF = TILE / 2;
const SOURCE_X = 120;
const RESULT_X = 424;

// Two-tone source: left half mid-gray (0x80), right half light-gray (0xc0), opaque. The vertical seam
// sits at x = HALF; the sharpen kernel overshoots contrast across it while leaving flat regions intact.
const source = createSurface(TILE, TILE, 0x808080ff);
fillSurfaceRectangle(createSurfaceRegion(source, HALF, 0, HALF, TILE), 0xc0c0c0ff);

// 3×3 sharpen: center weight 5, 4-neighborhood −1, divisor 1. Flat interiors stay put; the seam overshoots.
const result = new Uint8ClampedArray(TILE * TILE * 4);
applyConvolutionFilterToSurface(
  result,
  createSurfaceRegion(source),
  createConvolutionFilter({ matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0], matrixX: 3, matrixY: 3, divisor: 1 }),
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

// Sample rows are taken near vertical center to stay away from the top/bottom edges. The seam is at HALF.
const SAMPLE_Y = HALF;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale (canvas may be width × devicePixelRatio)

  const at = (tileX: number): number => {
    const px = Math.round((RESULT_X + tileX) * s);
    const py = Math.round((TOP + SAMPLE_Y) * s);
    return getSurfacePixelRgb(frame, px, py);
  };

  // Flat interiors are ~unchanged: deep inside the dark half stays ~0x80, deep inside the light half ~0xc0.
  const flatDark = at(HALF / 2); // x ≈ 64, well left of the seam
  if (!channelsClose(flatDark, 0x808080)) {
    throw new Error(`[filter-convolution-sharpen] flat dark interior expected ~#808080, got #${hex(flatDark)}`);
  }
  const flatLight = at(HALF + HALF / 2); // x ≈ 192, well right of the seam
  if (!channelsClose(flatLight, 0xc0c0c0)) {
    throw new Error(`[filter-convolution-sharpen] flat light interior expected ~#c0c0c0, got #${hex(flatLight)}`);
  }

  // Overshoot across the seam: the dark side just left drops below 0x80, the light side just right rises
  // above 0xc0. Either side proves the contrast-increasing signature; require both for a strong oracle.
  const darkEdge = at(HALF - 1); // last dark column before the seam
  const lightEdge = at(HALF); // first light column at the seam
  const darkLuma = (darkEdge >> 16) & 255;
  const lightLuma = (lightEdge >> 16) & 255;
  if (darkLuma >= 0x80) {
    throw new Error(
      `[filter-convolution-sharpen] expected dark-side overshoot below 0x80 near seam, got #${hex(darkEdge)}`,
    );
  }
  if (lightLuma <= 0xc0) {
    throw new Error(
      `[filter-convolution-sharpen] expected light-side overshoot above 0xc0 near seam, got #${hex(lightEdge)}`,
    );
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
