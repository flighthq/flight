// bitmap-perbitmap-smoothing — proves WebGL honors PER-BITMAP Bitmap.smoothing: two bitmaps in the SAME
// frame, sharing the same texture format, must sample with DIFFERENT filters. Before drawGlBitmap threaded
// the flag into the sprite-batch key, GL took the filter from the global state.allowSmoothing, so both
// bitmaps shared one filter and this distinction could not be made — the sibling bitmap-smoothing test
// only samples cell CENTERS (pure under either filter) and so never gated it. This scene samples the cell
// BOUNDARY, where nearest and bilinear diverge unambiguously under magnification (no mipmaps needed).
//
// A tiny 4×4 high-contrast checkerboard is drawn twice, upscaled 40× to 160px. The vertical boundary
// between the white cell (0,0) and the black cell (1,0) is sampled on each copy:
//   - smoothing = FALSE (nearest): the boundary is a hard edge — the sampled pixel is pure black or white.
//   - smoothing = TRUE  (bilinear): the boundary blends the two texels — the sampled pixel is mid-gray.
// The crisp copy's boundary being PURE is the real per-bitmap proof: it only holds if GL applied NEAREST
// to that specific bitmap rather than the (bilinear) global default the smoothed copy also uses.
//
// The two bitmaps SHARE ONE Image, so the texture/blend/material batch keys are identical between
// them — smoothing is the ONLY key that differs, forcing a flush. Give each bitmap its own resource and
// the pre-existing texture key would flush regardless, and the scene would pass even with the smoothing
// key removed; sharing the resource is what makes this genuinely gate the per-bitmap smoothing path.
//
// WebGPU has the same proof in the sibling .webgpu variant (its own bind-group-variant path); canvas/dom
// always honored per-bitmap smoothing (covered by the bare bitmap-smoothing / bitmap-downscale-smoothing).
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  SpriteKind,
  createSprite,
  createDisplayObject,
  createImageResourceFromCanvas,
  createPixelArtSampler,
  createTexture,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const SRC_SIZE = 4; // 4×4 checkerboard
const SCALE = 40; // upscaled to 160px (magnification — bilinear vs nearest diverges at texel edges)

const CRISP_X = 140; // smoothing = false
const CRISP_Y = 220;
const SMOOTH_X = 460; // smoothing = true
const SMOOTH_Y = 220;

function buildCheckerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SRC_SIZE;
  canvas.height = SRC_SIZE;
  const ctx = canvas.getContext('2d')!;
  for (let row = 0; row < SRC_SIZE; row++) {
    for (let col = 0; col < SRC_SIZE; col++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(col, row, 1, 1);
    }
  }
  return canvas;
}

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x808080ff, // opaque mid-gray, distinct from pure content
  kinds: [SpriteKind],
  expectedImageDescription:
    'On an opaque mid-gray field: two 160×160 squares side by side, each a 4×4 black-and-white ' +
    'checkerboard upscaled 40×. The LEFT square (x 140–300, y 220–380) uses nearest-neighbor ' +
    'sampling — every cell boundary is a hard edge; the pixel at a black↔white boundary is pure ' +
    'black or pure white, never gray. The RIGHT square (x 460–620, y 220–380) uses bilinear ' +
    'sampling — the same boundary pixel blends to mid-gray. Cell centers on both copies are pure ' +
    'black or pure white. The mid-gray background is visible around and between the two squares. ' +
    'No mid-gray pixels appear within the left square; mid-gray appears only at cell edges on ' +
    'the right.',
});

const root = createDisplayObject();

// One shared checker resource for BOTH bitmaps — see the header: this makes smoothing the only differing
// batch key, so the scene fails if the smoothing key is dropped from the flush comparison.
const checker = createImageResourceFromCanvas(buildCheckerCanvas());

function placeChecker(x: number, y: number, smoothing: boolean): void {
  const bmp = createSprite();
  bmp.data.texture = createTexture({
    sampler: smoothing ? undefined : createPixelArtSampler(),
    dimension: '2d',
    source: checker,
  });
  bmp.x = x;
  bmp.y = y;
  bmp.scaleX = SCALE;
  bmp.scaleY = SCALE;
  invalidateNodeLocalTransform(bmp);
  addNodeChild(root, bmp);
}

placeChecker(CRISP_X, CRISP_Y, false);
placeChecker(SMOOTH_X, SMOOTH_Y, true);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Cell centers: ((col + 0.5) * SCALE). The white cell (0,0) center resolves pure on BOTH copies (a
  // blend far from any edge samples one texel) — a baseline that the batch drew each bitmap at all.
  const whiteCx = 0.5 * SCALE;
  const whiteCy = 0.5 * SCALE;
  const crispCenter = at(CRISP_X + whiteCx, CRISP_Y + whiteCy);
  const smoothCenter = at(SMOOTH_X + whiteCx, SMOOTH_Y + whiteCy);
  if (!isWhite(crispCenter))
    throw new Error(`[bitmap-perbitmap-smoothing] crisp white-cell center not white — #${hex(crispCenter)}`);
  if (!isWhite(smoothCenter))
    throw new Error(`[bitmap-perbitmap-smoothing] smooth white-cell center not white — #${hex(smoothCenter)}`);

  // Boundary between white cell (0,0) and black cell (1,0): local x = 1*SCALE, at row-0 vertical center.
  const boundaryX = 1 * SCALE;
  const boundaryY = 0.5 * SCALE;

  // smoothing = FALSE → NEAREST → the boundary is a hard edge: pure black or white, never mid-gray. This
  // is the per-bitmap proof — under the (bilinear) global default this pixel would blend to gray.
  const crispEdge = at(CRISP_X + boundaryX, CRISP_Y + boundaryY);
  if (isMidGray(crispEdge)) {
    throw new Error(
      `[bitmap-perbitmap-smoothing] smoothing=false boundary blended to #${hex(crispEdge)} — NEAREST was not ` +
        `applied per-bitmap (the bitmap inherited the smoothed/global filter)`,
    );
  }

  // smoothing = TRUE → BILINEAR → the same boundary blends the two texels to mid-gray.
  const smoothEdge = at(SMOOTH_X + boundaryX, SMOOTH_Y + boundaryY);
  if (!isMidGray(smoothEdge)) {
    throw new Error(
      `[bitmap-perbitmap-smoothing] smoothing=true boundary not blended to mid-gray — got #${hex(smoothEdge)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 200 && channel(rgb, 8) > 200 && channel(rgb, 0) > 200;
}
// All three channels in the mid band — a genuine blend of the black/white texels, not a pure edge.
function isMidGray(rgb: number): boolean {
  const r = channel(rgb, 16);
  const g = channel(rgb, 8);
  const b = channel(rgb, 0);
  return r >= 60 && r <= 200 && g >= 60 && g <= 200 && b >= 60 && b <= 200;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
