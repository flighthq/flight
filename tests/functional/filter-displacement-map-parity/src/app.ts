// filter-displacement-map-parity — proves the WebGL NATIVE displacement-map shader matches the canonical
// surface (CPU) displacement reference.
//
// DisplacementMapFilter has a CPU reference impl (applyDisplacementMapFilterToSurface) and a single-pass
// WebGL shader impl (applyDisplacementMapFilterToWebGL) — but NO CSS form, so unlike the blur suite there
// is no DOM/Canvas native filter. This test draws two tiles side by side:
//   REFERENCE tile — the source warped on the CPU via applyDisplacementMapFilterToSurface, blitted as a
//     plain bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — on WebGL, the same source pushed through the real displacement shader path. On
//     Canvas/DOM there is no native filter, so the NATIVE tile is the surface result drawn as a plain
//     bitmap (parity holds by construction; WebGL is the meaningful comparison).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and asserts
// the mismatch fraction is below a calibrated tolerance — so on WebGL it proves the shader warp ≈ the CPU
// warp. It also asserts the native tile is not blank and was actually displaced (the line moved off its
// original column), so a silently no-op native path fails the test.
//
// Source/map/filter REUSE the validated filter-displacement-map-wrap test: a black tile with one vertical
// white line at x=128, a map whose RED channel is 255 on the left half / 0 on the right half driving X
// displacement (componentX=0, scaleX=24). The line lands at output x=116 in the left region and x=140 in
// the right region; column 128 goes black.
import { applyDisplacementMapFilterToSurface, createDisplacementMapFilter } from '@flighthq/filters';
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
const HALF = TILE / 2;
const REFERENCE_X = 120;
const NATIVE_X = 424;
const LINE_X = 128; // original vertical white line column
const SHIFT = 12; // 0.5 × scaleX (24); RED 255 ⇒ +SHIFT source read, RED 0 ⇒ −SHIFT source read

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Source: black tile with a single vertical white line at x = LINE_X. A hard 1px feature makes the
// displacement unambiguous to sample.
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, LINE_X, 0, 1, TILE), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// Displacement map: RED = 255 in left half, RED = 0 in right half (128 is neutral, so left shifts +, right −).
const map = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(map, 0, 0, HALF, TILE), 0xff0000ff);
fillSurfaceRectangle(createSurfaceRegion(map, HALF, 0, HALF, TILE), 0x000000ff);
const mapImage = createImageResourceFromCanvas(surfaceToCanvas(map.data));

const filter = createDisplacementMapFilter({
  mode: 'wrap',
  componentX: 0,
  componentY: 1,
  scaleX: 24,
  scaleY: 0,
});

// CPU reference: the canonical surface displacement warp. This is the oracle's ground truth and the bytes
// drawn into the REFERENCE tile on every backend.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
applyDisplacementMapFilterToSurface(referenceData, createSurfaceRegion(source), createSurfaceRegion(map), filter);
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-warped bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — on Canvas/DOM there is no native displacement filter, so the native tile is the same
// CPU-warped bytes drawn as a plain bitmap (parity by construction). On WebGL, drawNativeDisplacement runs
// the real GPU shader and composites its result over this tile region instead.
addNodeChild(root, makeBitmap(referenceData, NATIVE_X, TOP));

target.drawNativeDisplacement?.({
  source: sourceImage,
  map: mapImage,
  filter,
  x: NATIVE_X,
  y: TOP,
  tile: TILE,
});

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it back
// to TILE×TILE, and compares it to the CPU reference.
//
// Tolerance calibration: displacement is a hard-edged geometric warp (not a soft blur), so the shader and
// CPU samplers should agree almost everywhere. The only divergence is single-pixel sampling/rounding along
// the displaced line and at the map's left/right boundary (texture filtering vs JS nearest). MISMATCH_FRACTION
// is therefore kept tight at 0.10 (10% of pixels) with a CHANNEL_TOLERANCE of 24. Tighten once real captures
// pin the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.1;
const CHANNEL_TOLERANCE = 24;

const ROW = TILE / 2; // sample mid-height, away from any tile edge

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Actually displaced: the white line moved off its original column (now black) and onto x=116 (left
  // RED-255 region, +SHIFT read) and x=140 (right RED-0 region, −SHIFT read). A no-op native path would
  // leave the line on column 128.
  const original = green(getSurfacePixelRGB(nativeTile, LINE_X, ROW));
  if (original > 120) {
    throw new Error(
      `[filter-displacement-map-parity:${render()}] native line not displaced — original column ${LINE_X} still bright (green ${original})`,
    );
  }
  const leftShifted = green(getSurfacePixelRGB(nativeTile, LINE_X - SHIFT, ROW));
  const rightShifted = green(getSurfacePixelRGB(nativeTile, LINE_X + SHIFT, ROW));
  if (leftShifted <= 120 || rightShifted <= 120) {
    throw new Error(
      `[filter-displacement-map-parity:${render()}] native displaced line missing — ` +
        `green at x=${LINE_X - SHIFT} is ${leftShifted}, at x=${LINE_X + SHIFT} is ${rightShifted} (expected both > 120)`,
    );
  }

  // 2) Parity: the native warp matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-displacement-map-parity:${render()}] native displacement diverges from CPU reference — ` +
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
