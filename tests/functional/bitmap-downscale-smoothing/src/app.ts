// BACKEND CAVEAT: scoped to canvas/dom (see package.json `renderers`). On WebGL/WGPU the bitmap texture
// filter is taken from the GLOBAL state.allowSmoothing (render-gl bindGlTexture), NOT the per-bitmap
// smoothing flag — so both bitmaps share one filter and the nearest-vs-bilinear distinction cannot be
// made there. A renderer limitation; Canvas/DOM honor per-bitmap smoothing.
//
// bitmap-downscale-smoothing — validates Bitmap.smoothing under DOWN-scaling, the minification case the
// existing bitmap-smoothing test (upscaling) does not cover. A large 256×256 high-frequency checkerboard
// (8px black/white cells) is drawn twice, each scaled DOWN to ~0.3× (~77px). With smoothing OFF
// (nearest-neighbor), minification point-samples one source texel per output pixel: because the source is
// pure black/white, every output pixel stays near-pure black or white — the image aliases into hard noise
// with no intermediate tones. With smoothing ON, bilinear minification averages several source texels per
// output pixel, so the dense checker collapses toward gray and many pixels carry MID-GRAY (intermediate)
// values.
//
// This is visual because the distinction lives entirely in how the rasterizer resolves many source texels
// into one output pixel during minification; it cannot be observed without actually downscaling the image.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Source: 256×256 checkerboard with 8px cells → 32×32 cells of alternating black/white. High frequency so
// minification has many texels to average per output pixel.
const SRC_SIZE = 256;
const CELL = 8;

// Downscale factor: 256 * 0.3 ≈ 77px on screen.
const SCALE = 0.3;
const OUT_SIZE = SRC_SIZE * SCALE; // ≈ 76.8

// Two copies side by side, vertically centered-ish.
const ALIAS_X = 200; // smoothing = false
const ALIAS_Y = 260;
const SMOOTH_X = 520; // smoothing = true
const SMOOTH_Y = 260;

// Sample band: a horizontal row of points across the interior of each downscaled image, avoiding the very
// edges (which can be partially off-image). Spans roughly 10%..90% of the output width at vertical center.
const BAND_Y_FRAC = 0.5;
const BAND_X_FRACS: readonly number[] = [0.12, 0.22, 0.32, 0.42, 0.5, 0.58, 0.68, 0.78, 0.88];

function buildCheckerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SRC_SIZE;
  canvas.height = SRC_SIZE;
  const ctx = canvas.getContext('2d')!;
  const cells = SRC_SIZE / CELL;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#ffffff' : '#000000';
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
  }
  return canvas;
}

const { height, render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x808080ff, // opaque mid-gray, so off-image samples are distinguishable from content.
  kinds: [BitmapKind],
});

const root = createDisplayContainer();

function placeChecker(x: number, y: number, smoothing: boolean): void {
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(buildCheckerCanvas());
  bmp.data.smoothing = smoothing;
  bmp.x = x;
  bmp.y = y;
  bmp.scaleX = SCALE;
  bmp.scaleY = SCALE;
  invalidateNodeLocalTransform(bmp);
  addNodeChild(root, bmp);
}

placeChecker(ALIAS_X, ALIAS_Y, false);
placeChecker(SMOOTH_X, SMOOTH_Y, true);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Sample the band across each downscaled image and classify pixels.
  const aliasSamples = sampleBand(at, ALIAS_X, ALIAS_Y);
  const smoothSamples = sampleBand(at, SMOOTH_X, SMOOTH_Y);

  // smoothing = FALSE (nearest): every sampled pixel should be near-pure black or white. No pixel should
  // carry all three channels in the mid range (60..200) — that would indicate averaging, which nearest
  // does not do.
  const aliasMid = aliasSamples.filter(isMidGray).length;
  if (aliasMid > 0) {
    throw new Error(
      `[bitmap-downscale-smoothing] smoothing=false produced ${aliasMid} mid-gray sample(s); ` +
        `nearest-neighbor minification of a pure black/white source must stay near-pure — ` +
        `samples: ${aliasSamples.map(hex).join(',')}`,
    );
  }

  // smoothing = TRUE (bilinear): averaging across the dense checker must yield intermediate tones. Require
  // at least a few samples with a channel in the 80..180 band.
  const smoothMid = smoothSamples.filter(hasIntermediateChannel).length;
  if (smoothMid < 3) {
    throw new Error(
      `[bitmap-downscale-smoothing] smoothing=true produced only ${smoothMid} intermediate sample(s); ` +
        `bilinear minification should average the dense checker toward gray — ` +
        `samples: ${smoothSamples.map(hex).join(',')}`,
    );
  }
}

function sampleBand(at: (x: number, y: number) => number, originX: number, originY: number): readonly number[] {
  const y = originY + OUT_SIZE * BAND_Y_FRAC;
  return BAND_X_FRACS.map((fx) => at(originX + OUT_SIZE * fx, y));
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
// All three channels sit in the mid band — evidence of true averaging (a blended gray, not pure b/w).
function isMidGray(rgb: number): boolean {
  const r = channel(rgb, 16);
  const g = channel(rgb, 8);
  const b = channel(rgb, 0);
  return r >= 60 && r <= 200 && g >= 60 && g <= 200 && b >= 60 && b <= 200;
}
// At least one channel in the 80..180 band — a looser "this pixel is not pure black/white" probe.
function hasIntermediateChannel(rgb: number): boolean {
  return inBand(channel(rgb, 16)) || inBand(channel(rgb, 8)) || inBand(channel(rgb, 0));
}
function inBand(v: number): boolean {
  return v >= 80 && v <= 180;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
