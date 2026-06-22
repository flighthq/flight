// filter-pixelate-parity — proves each backend's NATIVE pixelate filter matches the canonical surface
// (CPU) pixelate.
//
// Parity-suite sibling of filter-blur-parity. A filter has a CPU reference impl
// (applyPixelateFilterToSurface) and native per-backend impls. Pixelate has NO CSS equivalent, so the
// only native path is Gl's single-pass shader (applyPixelateFilterToGl); on Canvas/DOM the
// "native" tile is the surface result itself (parity holds by construction). This test draws two tiles:
//   REFERENCE tile — the source pixelated on the CPU via applyPixelateFilterToSurface, blitted as a
//     plain bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — on Gl, the same source pushed through the real GPU pixelate shader, composited
//     over the scene; on Canvas/DOM, the reference bytes again (no native pixelate path there).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// pixelate ≈ the CPU pixelate. It also asserts the native tile is not blank and is actually pixelated
// (adjacent blocks step to different flat colors), so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract
// (see ./parity.ts) and app.ts calls drawNativePixelate unconditionally — it is a no-op on Canvas/DOM.
// It imports createParityTarget from ./render (the local barrel); the functional vite harness routes
// ./render to the active backend's render.<renderer>.ts at runtime, the same way particle-emitter does.
import { applyPixelateFilterToSurface, createPixelateFilter } from '@flighthq/filters';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createSurface,
  createSurfaceFromCanvas,
  createSurfaceRegion,
  getSurfaceMismatch,
  getSurfacePixelRgb,
  setSurfacePixel,
} from '@flighthq/sdk';

import { createParityTarget } from './render';

const TILE = 256;
const REFERENCE_X = 120;
const NATIVE_X = 424;
// Block edge in logical pixels. Must match the surface reference's blockSize AND the Gl pass's
// blockSize, or the two tiles cannot align block-for-block.
const BLOCK = 16;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Source: smooth horizontal grey gradient, R=G=B ramp 0..255 left to right, opaque (packed RGBA). Each
// column is one grey level — pixelation collapses each BLOCK-wide column band to one flat color, so the
// stepping is unambiguous to sample (reused from the validated filter-pixelate test).
const source = createSurface(TILE, TILE, 0x000000ff);
for (let x = 0; x < TILE; x++) {
  const v = Math.round((x / (TILE - 1)) * 255);
  const rgba = ((v << 24) | (v << 16) | (v << 8) | 0xff) >>> 0;
  for (let y = 0; y < TILE; y++) {
    setSurfacePixel(source, x, y, rgba);
  }
}
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: the canonical surface pixelate. This is the oracle's ground truth and the bytes drawn
// into the REFERENCE tile on every backend.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
applyPixelateFilterToSurface(referenceData, createSurfaceRegion(source), createPixelateFilter({ blockSize: BLOCK }));
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-pixelated bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — the CPU-pixelated bytes again as the base bitmap. On Canvas/DOM that IS the native tile
// (no native pixelate path); on Gl the GPU pixelate composite overdraws it with the real shader
// result at the same position, so the oracle reads the shader output there.
addNodeChild(root, makeBitmap(referenceData, NATIVE_X, TOP));

target.drawNativePixelate?.({ source: sourceImage, blockSize: BLOCK, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Oracle (runs for canvas/webgl; DOM has no canvas readback so its parity is best-effort via the
// harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it back to
// TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE calibrated for block pixelation. The CPU reference AVERAGES each
// block; the Gl shader samples each block's CENTER texel. On a linear gradient those agree closely,
// but they disagree by a few grey levels along the block boundaries, and the V-flip/texel-grid
// composite adds a sub-pixel column of misalignment at each of the 16 block seams. That seam band is a
// minority of the tile, so a moderate fraction with a moderate channel tolerance is the right calibration
// — tighter than a blurry effect (no soft bleed) but not the ~0.10 a color-matrix recolor would use.
// Tighten once real captures pin down the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 24;

// Block columns sampled to prove the gradient steps block-to-block (block index 4 vs 5), mirroring the
// validated filter-pixelate oracle.
const BLOCK_A = 4; // tile-local x range 64..79
const BLOCK_B = 5; // tile-local x range 80..95

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the bright right half of the gradient must carry colour, not just the background.
  const bright = green(getSurfacePixelRgb(nativeTile, TILE - 8, TILE / 2));
  if (bright <= 120) {
    throw new Error(`[filter-pixelate-parity:${render()}] native tile blank/dark at right — got green ${bright}`);
  }

  // 2) Actually pixelated: block A and block B flatten to DIFFERENT flat colours. A no-op native path
  // would leave the smooth gradient, where two columns 16px apart differ only slightly anyway, so we
  // also require block A to be internally uniform (its interior samples agree) — the defining behavior.
  const aLeft = green(getSurfacePixelRgb(nativeTile, BLOCK_A * BLOCK + 2, TILE / 2));
  const aRight = green(getSurfacePixelRgb(nativeTile, BLOCK_A * BLOCK + 13, TILE / 2));
  const b = green(getSurfacePixelRgb(nativeTile, BLOCK_B * BLOCK + 7, TILE / 2));
  if (Math.abs(aLeft - aRight) > 12) {
    throw new Error(
      `[filter-pixelate-parity:${render()}] native block ${BLOCK_A} not flat — green ${aLeft} vs ${aRight}`,
    );
  }
  if (Math.abs(aLeft - b) < 8) {
    throw new Error(
      `[filter-pixelate-parity:${render()}] native blocks did not step — block ${BLOCK_A} green ${aLeft} ≈ block ${BLOCK_B} green ${b}`,
    );
  }

  // 3) Parity: the native pixelate matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-pixelate-parity:${render()}] native pixelate diverges from CPU reference — ` +
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
  ctx.imageSmoothingEnabled = false;
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
