// filter-gradient-glow-parity — proves the WebGL NATIVE gradient-glow shader matches the canonical
// surface (CPU) gradient glow.
//
// Companion to filter-blur-parity, for a filter with no CSS form. A gradient glow blurs the source
// silhouette's alpha, looks the blurred alpha up in a color/alpha gradient ramp, then composites the
// glow under the source. The CPU reference is applyGradientGlowFilterToSurface; the WebGL native path
// is applyGradientGlowFilterToWebGL (a tint pass, a box blur, and a ramp-lookup pass into offscreen
// render targets). Canvas/DOM have no native gradient-glow filter, so their native tile is the CPU
// reference itself — parity is trivially exact there and the WebGL comparison is the real test.
//
// Two tiles side by side:
//   REFERENCE tile — the source glowed on the CPU via applyGradientGlowFilterToSurface (mask then
//     source-over), blitted as a plain bitmap. Identical bytes on every backend; the oracle's ground truth.
//   NATIVE tile    — WebGL: the same source pushed through the real GPU glow shader and composited.
//                    Canvas/DOM: the same CPU-reference bytes (drawNativeGradientGlow is a no-op).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance, plus a not-blank / actually-glowing
// guard so a silently no-op native path fails.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts). It imports createParityTarget from ./render (the local barrel); the functional vite
// harness routes ./render to the active backend's render.<renderer>.ts at runtime.
import { applyGradientGlowFilterToSurface, createGradientGlowFilter } from '@flighthq/filters';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createSurface,
  createSurfaceFromCanvas,
  createSurfaceRegion,
  fillSurfaceRectangle,
  getSurfaceMismatch,
  getSurfacePixelRGB,
} from '@flighthq/sdk';

import { createParityTarget } from './render';

const TILE = 256;
const SQUARE = 96;
const SQUARE_MIN = (TILE - SQUARE) / 2; // 80
const SQUARE_MAX = SQUARE_MIN + SQUARE; // 176
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Filter config — reused verbatim from the validated filter-gradient-glow example: gradient ramp
// transparent-black (ratio 0) → opaque-magenta (ratio 255), so the soft glow ring outside the square
// edges is magenta.
const GLOW_CONFIG = {
  colors: [0x000000, 0xff00ff],
  alphas: [0, 1],
  ratios: [0, 255],
  blurX: 8,
  blurY: 8,
  strength: 2,
};

// Source: a centered opaque-white square on transparent black (matches the validated example). A hard
// silhouette makes the glow ring unambiguous to sample.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: the canonical surface gradient glow, then the source composited on top — the oracle's
// ground truth and the bytes drawn into the REFERENCE tile (and into Canvas/DOM native tiles).
const maskData = new Uint8ClampedArray(TILE * TILE * 4);
const glowScratch = new Uint8ClampedArray(TILE * TILE * 4);
applyGradientGlowFilterToSurface(
  maskData,
  glowScratch,
  createSurfaceRegion(source),
  createGradientGlowFilter(GLOW_CONFIG),
);

// Composite: result = glow mask, then source-over on top (straight-alpha over) — same as the example.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
const src = source.data;
for (let i = 0; i < referenceData.length; i += 4) {
  const sa = src[i + 3] / 255;
  const ma = maskData[i + 3] / 255;
  const outA = sa + ma * (1 - sa);
  for (let c = 0; c < 3; c++) {
    const sc = src[i + c];
    const mc = maskData[i + c];
    referenceData[i + c] = outA > 0 ? Math.round((sc * sa + mc * ma * (1 - sa)) / outA) : 0;
  }
  referenceData[i + 3] = Math.round(outA * 255);
}
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-glowed bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile. WebGL composites the GPU glow over this position; Canvas/DOM have no native glow filter,
// so the native tile IS the CPU-reference bitmap (drawn here, drawNativeGradientGlow a no-op). On WebGL
// the GPU composite lands at the same position over whatever this draws — but the background is opaque
// black there, so we leave the native slot empty on WebGL by drawing the reference only when there is no
// shader path. The composite spec drives the real WebGL tile.
if (target.kind !== 'webgl') {
  addNodeChild(root, makeBitmap(referenceData, NATIVE_X, TOP));
}

target.drawNativeGradientGlow?.({
  source: sourceImage,
  filter: createGradientGlowFilter(GLOW_CONFIG),
  x: NATIVE_X,
  y: TOP,
  tile: TILE,
});

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it back
// to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are CALIBRATED for a glow effect: the GPU path uses a box-blur
// approximation of the CPU Gaussian and an 8-bit gradient ramp, so the soft glow band and the ring's
// fade-off diverge from the CPU reference across a sizeable fraction of the tile. This is a blurry/glow
// effect (looser ~0.30), not a per-pixel color-matrix (which would be tight ~0.10). Tighten once real
// captures pin down the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 40;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the square center must still be white (the source composited on top of the glow).
  const center = getSurfacePixelRGB(nativeTile, TILE / 2, TILE / 2);
  if (green(center) <= 120) {
    throw new Error(`[filter-gradient-glow-parity:${render()}] native tile blank/dark at center — got #${hex(center)}`);
  }

  // 2) Actually glowing: just outside the square edge the magenta glow ring must be present — magenta
  // means R and B both clearly above G. A no-op native path would leave this background-black.
  const ring = getSurfacePixelRGB(nativeTile, TILE / 2, SQUARE_MAX + 2);
  const r = (ring >> 16) & 255;
  const g = (ring >> 8) & 255;
  const b = ring & 255;
  if (r <= 30 || b <= 30 || r <= g || b <= g) {
    throw new Error(
      `[filter-gradient-glow-parity:${render()}] native glow ring missing/wrong hue at edge — expected magenta, got #${hex(ring)}`,
    );
  }

  // 3) Parity: the native glow matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-gradient-glow-parity:${render()}] native glow diverges from CPU reference — ` +
        `${(mismatch.fraction * 100).toFixed(1)}% of pixels mismatched (max ${MISMATCH_FRACTION * 100}%), ` +
        `maxChannelDelta ${mismatch.maxChannelDelta}`,
    );
  }
}

// Writes a flat RGBA frame into a canvas, then crops the [sx,sy,sw,sh] region and scales it to size×size.
function cropFrameTile(
  frame: Readonly<Surface>,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  size: number,
): Surface {
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = frame.width;
  frameCanvas.height = frame.height;
  frameCanvas.getContext('2d')!.putImageData(toImageData(frame.data, frame.width, frame.height), 0, 0);

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = size;
  tileCanvas.height = size;
  const ctx = tileCanvas.getContext('2d')!;
  ctx.drawImage(frameCanvas, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), 0, 0, size, size);
  return createSurfaceFromCanvas(tileCanvas, 0, 0, size, size);
}

function green(rgb: number): number {
  return (rgb >> 8) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function makeBitmap(data: Uint8ClampedArray, x: number, y: number) {
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(surfaceToCanvas(data));
  bmp.data.smoothing = false;
  bmp.x = x;
  bmp.y = y;
  return bmp;
}

// Reads the render the verifier is running for — used only to tag oracle error messages by backend.
function render(): string {
  return (window as unknown as { __ftVerification?: { render: string } }).__ftVerification?.render ?? 'unknown';
}

function surfaceToCanvas(data: Readonly<Uint8ClampedArray>): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  canvas.getContext('2d')!.putImageData(toImageData(data, TILE, TILE), 0, 0);
  return canvas;
}

// Copies RGBA bytes into a freshly allocated ImageData. The copy gives the ImageData a concrete
// ArrayBuffer (a Surface's data may be typed over ArrayBufferLike), which the DOM ImageData ctor requires.
function toImageData(data: Readonly<Uint8ClampedArray>, width: number, height: number): ImageData {
  const image = new ImageData(width, height);
  image.data.set(data);
  return image;
}
