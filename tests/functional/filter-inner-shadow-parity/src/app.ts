// filter-inner-shadow-parity — proves each backend's NATIVE inner-shadow filter matches the canonical
// surface (CPU) inner shadow.
//
// Sibling of filter-blur-parity, for a filter with NO CSS form. A filter has a CPU reference impl
// (apply*FilterToSurface) and, on Gl, a native multi-pass shader (apply*FilterToGl). This test
// draws two tiles side by side:
//   REFERENCE tile — the source with the inner shadow composited on the CPU (applyInnerShadowFilterToSurface
//     → composite source-over the mask), blitted as a plain bitmap. Identical bytes on every backend; it is
//     the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path. Inner shadow has no
//     CSS form, so on Canvas/DOM the "native" tile is the SAME reference bitmap (parity by construction);
//     on Gl it is the real inner-shadow shader composited from offscreen render targets. Gl is the
//     meaningful comparison.
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and asserts
// the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader inner shadow ≈
// the CPU inner shadow. It also asserts the native tile is not blank (bright center) and actually carries
// the shadow band (a dark ring just inside the edge), so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts) and app.ts calls applyNativeInnerShadow (no-op everywhere — inner shadow has no CSS form)
// and drawNativeInnerShadow (the Gl shader path) unconditionally. It imports createParityTarget from
// ./render (the local barrel); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime.
import { applyInnerShadowFilterToSurface, createInnerShadowFilter } from '@flighthq/filters';
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
  getSurfacePixelRgb,
} from '@flighthq/sdk';

import { createParityTarget } from './render';

const TILE = 256;
const SQUARE = 160;
const SQUARE_MIN = (TILE - SQUARE) / 2; // 48
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// The inner-shadow descriptor — shared by the surface reference and the Gl native path so both run the
// same effect. Matches the validated filter-inner-shadow test's config.
const FILTER = createInnerShadowFilter({ distance: 8, angle: 45, color: 0x000000, blurX: 4, blurY: 4, strength: 1 });

// Source: a centered 160×160 opaque-white square on transparent black (packed RGBA). The inner shadow
// extracts inverted alpha, so the source needs a real alpha edge (unlike blur's opaque tile).
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);
const sourceCanvas = surfaceToCanvas(source.data);
const sourceImage = createImageResourceFromCanvas(sourceCanvas);

// CPU reference: the canonical surface inner shadow. Produce the inner-shadow mask, then composite
// source-over: source first, mask on top (the shadow hugs the inside of the shape boundary). This is the
// oracle's ground truth and the bytes drawn into the REFERENCE tile on every backend.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurScratch = new Uint8ClampedArray(TILE * TILE * 4);
applyInnerShadowFilterToSurface(mask, blurScratch, createSurfaceRegion(source), FILTER);

const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
referenceData.set(source.data.subarray(0, TILE * TILE * 4));
compositeOver(referenceData, mask);
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU inner-shadow bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile.
//   Canvas/DOM: inner shadow has no CSS form, so the native tile is the same reference bitmap (parity by
//     construction). applyNativeInnerShadow is a no-op; the bitmap below carries the result.
//   Gl: the source bitmap is drawn here only as a placeholder; drawNativeInnerShadow runs the GPU pass
//     and composites the real shader result on top at the same position.
const nativeBitmap = createBitmap();
nativeBitmap.data.image = isGl(target) ? sourceImage : createImageResourceFromCanvas(surfaceToCanvas(referenceData));
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

target.applyNativeInnerShadow(nativeBitmap, FILTER);
target.drawNativeInnerShadow?.({ source: sourceImage, filter: FILTER, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it back
// to TILE×TILE, and compares it to the CPU reference.
//
// Calibrated tolerance: inner shadow is a blurred/glow-style soft effect (the shadow is a blurred band
// inside the shape edge), so the GPU vs CPU kernels diverge most along that soft band — a minority of the
// tile. This warrants a generous tolerance like blur-parity (~0.30), not the tight ~0.10 a hard-edged
// effect like color-matrix would use. Tighten once real captures pin down the actual divergence; loosen
// only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 32;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the shape center stays bright (near white), so the tile carries the square.
  const center = green(getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2));
  if (center <= 120) {
    throw new Error(`[filter-inner-shadow-parity:${render()}] native tile blank/dark at center — got green ${center}`);
  }

  // 2) Actually filtered: the inner shadow rings the inside of the edge, so a point just inside the shape
  // boundary is notably darker than the bright center. A no-op native path would leave it ~255 (white) or
  // background. Sample just inside the top-left corner, within the narrow shadow band.
  const edge = green(getSurfacePixelRgb(nativeTile, SQUARE_MIN + 3, SQUARE_MIN + 3));
  if (edge >= center - 48) {
    throw new Error(
      `[filter-inner-shadow-parity:${render()}] native inner edge not shadowed — green ${edge} ` +
        `(expected notably below center ${center})`,
    );
  }

  // 3) Parity: the native inner shadow matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-inner-shadow-parity:${render()}] native inner shadow diverges from CPU reference — ` +
        `${(mismatch.fraction * 100).toFixed(1)}% of pixels mismatched (max ${MISMATCH_FRACTION * 100}%), ` +
        `maxChannelDelta ${mismatch.maxChannelDelta}`,
    );
  }
}

// Source-over composite of `src` onto `dest` (both straight-alpha RGBA).
function compositeOver(dest: Uint8ClampedArray, src: Readonly<Uint8ClampedArray>): void {
  for (let i = 0; i < dest.length; i += 4) {
    const sa = src[i + 3] / 255;
    if (sa === 0) continue;
    const ia = 1 - sa;
    dest[i] = Math.round(src[i] * sa + dest[i] * ia);
    dest[i + 1] = Math.round(src[i + 1] * sa + dest[i + 1] * ia);
    dest[i + 2] = Math.round(src[i + 2] * sa + dest[i + 2] * ia);
    dest[i + 3] = Math.min(255, src[i + 3] + Math.round(dest[i + 3] * ia));
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

// True when the active backend runs the real Gl shader path (it provides drawNativeInnerShadow).
function isGl(t: ReturnType<typeof createParityTarget>): boolean {
  return t.kind === 'webgl';
}

function makeBitmap(data: Readonly<Uint8ClampedArray>, x: number, y: number) {
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
