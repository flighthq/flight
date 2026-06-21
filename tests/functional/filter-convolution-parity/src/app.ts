// filter-convolution-parity — proves the NATIVE per-backend convolution filter matches the canonical
// surface (CPU) convolution.
//
// A filter has a CPU reference impl (applyConvolutionFilterToSurface) and a native per-backend impl. For
// convolution there is NO CSS form: Canvas/DOM have no native convolution path, only WebGL does (a
// single-pass shader, applyConvolutionFilterToWebGL). This test draws two tiles side by side:
//   REFERENCE tile — the source convolved on the CPU via applyConvolutionFilterToSurface, blitted as a
//     plain bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path. On WebGL that is the
//     convolution shader over an offscreen target; on Canvas/DOM it is the surface reference bytes again
//     (no native convolution exists there, so parity holds by construction).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and asserts
// the mismatch fraction is below a calibrated tolerance — so on WebGL it proves the shader convolution ≈
// the CPU convolution. It also asserts the native tile is not blank and is actually filtered (the square's
// interior collapsed to near-black, its edge stays bright), so a silently no-op native path fails.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts) and app.ts calls applyNativeConvolution (no native CSS path on any backend) and
// drawNativeConvolution (shader backends) unconditionally — the inactive one is a no-op. It imports
// createParityTarget from ./render (the local barrel); the functional vite harness routes ./render to the
// active backend's render.<renderer>.ts at runtime, the same way blur-parity does.
import { applyConvolutionFilterToSurface, createConvolutionFilter } from '@flighthq/filters';
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
const SQUARE = 160;
const SQUARE_OFFSET = (TILE - SQUARE) / 2; // 48 — centers the square within the tile
const SQUARE_MAX = SQUARE_OFFSET + SQUARE; // 208 — the square's right edge
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// 3×3 edge-detect (Laplacian) kernel, divisor 1. Kernel sums to zero, so flat regions collapse to black
// while edges (white↔black transitions) light up bright. Reused verbatim from the validated
// filter-convolution-edge test. matrixX*matrixY = 9 ≤ the WebGL 7×7 (49) maximum, so the shader path
// accepts it directly. The surface and WebGL appliers both default to edge:'clamp' and preserveAlpha:true,
// so the same descriptor produces matching math on both — that shared default is load-bearing for parity.
const KERNEL = {
  matrix: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  matrixX: 3,
  matrixY: 3,
  divisor: 1,
};

// Source: black tile with a centred 160×160 opaque-white square (packed RGBA). The hard step edge is the
// feature the convolution lights up.
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_OFFSET, SQUARE_OFFSET, SQUARE, SQUARE), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: the canonical surface convolution. This is the oracle's ground truth and the bytes drawn
// into the REFERENCE tile on every backend (and the NATIVE tile on Canvas/DOM, which have no native path).
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
applyConvolutionFilterToSurface(referenceData, createSurfaceRegion(source), createConvolutionFilter(KERNEL));
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-convolved bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile.
//   WebGL: drawNativeConvolution runs the GPU shader pass and composites it at NATIVE_X (the placeholder
//     bitmap below is overwritten by the composite, so its initial image does not matter for WebGL).
//   Canvas/DOM: no native convolution exists, so the native tile is the surface reference bytes drawn as a
//     plain bitmap — parity holds by construction and the oracle still confirms it is the filtered image.
const nativeBitmap = createBitmap();
nativeBitmap.data.image = sourceImage;
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

if (target.kind === 'webgl') {
  target.applyNativeConvolution();
  target.drawNativeConvolution?.({ source: sourceImage, filter: KERNEL, x: NATIVE_X, y: TOP, tile: TILE });
} else {
  // No native convolution on Canvas/DOM — draw the surface reference as the native tile.
  nativeBitmap.data.image = createImageResourceFromCanvas(surfaceToCanvas(referenceData));
}

target.render(root);

// Oracle (runs for canvas/webgl; DOM has no canvas-readback so its assertRender is skipped by the
// harness). Crops the NATIVE tile out of the device-scaled frame, scales it back to TILE×TILE, and
// compares it to the CPU reference.
//
// Calibrated tolerance. Convolution is a sharp, mostly-flat transform: the interior and background collapse
// to exact black on both the CPU and the shader, and only the thin edge band carries signal, where GPU
// bilinear/rounding can disagree by a few least-significant bits. A 3×3 integer kernel is far tighter than
// a blurry Gaussian, so the fraction tolerance is set near the color-matrix end of the scale (0.10), with a
// modest channel tolerance for GPU rounding. Tighten once real captures pin the actual divergence; loosen
// only with a noted reason.
const MISMATCH_FRACTION = 0.1;
const CHANNEL_TOLERANCE = 24;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the CPU
  // reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Actually filtered, not the raw source: the square's interior is a flat region, which the edge-detect
  // kernel collapses to near-black. The source had a solid white square there, so a no-op native path would
  // leave this bright. Sampling the interior catches "drew the source instead of the filtered image".
  const interior = maxChannel(getSurfacePixelRGB(nativeTile, TILE / 2, TILE / 2));
  if (interior >= 70) {
    throw new Error(
      `[filter-convolution-parity:${render()}] native interior should collapse to near-black (<70), got ${interior}`,
    );
  }

  // 2) Not blank: the square's edge is a high-contrast transition the kernel lights up bright. A blank tile
  // (background only) or a fully-zeroed result would fail this.
  const edge = maxChannel(getSurfacePixelRGB(nativeTile, SQUARE_MAX, TILE / 2));
  if (edge <= 120) {
    throw new Error(`[filter-convolution-parity:${render()}] native edge should detect bright (>120), got ${edge}`);
  }

  // 3) Parity: the native convolution matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-convolution-parity:${render()}] native convolution diverges from CPU reference — ` +
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

function makeBitmap(data: Uint8ClampedArray, x: number, y: number) {
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(surfaceToCanvas(data));
  bmp.data.smoothing = false;
  bmp.x = x;
  bmp.y = y;
  return bmp;
}

function maxChannel(rgb: number): number {
  return Math.max((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
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
