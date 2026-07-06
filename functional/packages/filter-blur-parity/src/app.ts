// filter-blur-parity — proves each backend's NATIVE blur filter matches the canonical surface (CPU) blur.
//
// Reference template for a whole filter-"parity" suite. A filter has a CPU reference impl
// (apply*FilterToSurface) and native per-backend impls (CSS for DOM/Canvas, a multi-pass shader for
// Gl). This test draws two tiles side by side:
//   REFERENCE tile — the source blurred on the CPU via applyBlurFilterToSurface, blitted as a plain
//     bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path (CSS blur on
//     DOM/Canvas, the Gaussian shader on Gl).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// blur ≈ the CPU blur, and on Canvas it proves the CSS blur ≈ the CPU blur. It also asserts the native
// tile is not blank and is actually blurred, so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract
// (see ./parity.ts) and app.ts calls applyNativeBlur (CSS backends) and drawNativeBlur (shader
// backends) unconditionally — the inactive one is a no-op on each backend. It imports createParityTarget
// from ./render (the local barrel); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime, the same way particle-emitter does.
import { createBlurFilter } from '@flighthq/filters';
import { applyBlurFilterToSurface } from '@flighthq/filters-surface';
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
const SQUARE = 128;
const SQUARE_MIN = (TILE - SQUARE) / 2; // 64
const SQUARE_MAX = SQUARE_MIN + SQUARE; // 192
const REFERENCE_X = 120;
const NATIVE_X = 424;
// Symmetric blur — computeBlurFilterCss returns null for anisotropic blur, so the CSS backends require
// blurX === blurY. 6px keeps the bleed well inside the tile (3σ = 18px < the 64px margin).
const BLUR = 6;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Source: black tile with a centred 128×128 opaque-white square (packed RGBA). A hard step edge makes
// the blur's effect unambiguous to sample.
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);
const sourceCanvas = surfaceToCanvas(source.data);
const sourceImage = createImageResourceFromCanvas(sourceCanvas);

// CPU reference: the canonical surface Gaussian blur. This is the oracle's ground truth and the bytes
// drawn into the REFERENCE tile on every backend.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
const blurScratch = new Uint8ClampedArray(TILE * TILE * 4);
applyBlurFilterToSurface(
  referenceData,
  blurScratch,
  createSurfaceRegion(source),
  createBlurFilter({ blurX: BLUR, blurY: BLUR }),
);
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

// Awaited because the Wgpu column creates its render state asynchronously; the sync backends return a
// plain target and await passes it through unchanged.
const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-blurred bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — the source bitmap, blurred the native way for this backend.
//   CSS backends: bind a blur() filter to this node; the normal render rasterizes it.
//   Shader backends: applyNativeBlur is a no-op; drawNativeBlur runs the GPU pass and composites it.
const nativeBitmap = createBitmap();
nativeBitmap.data.image = sourceImage;
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

target.applyNativeBlur(nativeBitmap, createBlurFilter({ blurX: BLUR, blurY: BLUR }));
target.drawNativeBlur?.({ source: sourceImage, blurX: BLUR, blurY: BLUR, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort
// via the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales
// it back to TILE×TILE, and compares it to the CPU reference. Blur approximations (CSS vs shader vs
// CPU) diverge most along the soft edge, so the tolerance is generous and calibrated, not exact.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated for a ~6px symmetric Gaussian on a hard edge: the
// CSS/shader/CPU kernels disagree only in the gradient band around the former edge, a minority of the
// tile. Tighten once real captures pin down the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 24;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the tile must carry the square, not just the background.
  const centre = green(getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2));
  if (centre <= 120) {
    throw new Error(`[filter-blur-parity:${render()}] native tile blank/dark at centre — got green ${centre}`);
  }

  // 2) Actually blurred: the former hard edge (x = SQUARE_MAX) is now an intermediate gradient value,
  // not the source's hard black/white step. A no-op native path would leave it ~0 or ~255.
  const edge = green(getSurfacePixelRgb(nativeTile, SQUARE_MAX, TILE / 2));
  if (edge < 30 || edge > 225) {
    throw new Error(`[filter-blur-parity:${render()}] native edge not blurred — green ${edge} (expected 30..225)`);
  }

  // 3) Parity: the native blur matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-blur-parity:${render()}] native blur diverges from CPU reference — ` +
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
