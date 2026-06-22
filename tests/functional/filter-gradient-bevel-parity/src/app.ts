// filter-gradient-bevel-parity — proves each backend's NATIVE gradient-bevel filter matches the
// canonical surface (CPU) gradient bevel.
//
// A filter has a CPU reference impl (applyGradientBevelFilterToSurface) and native per-backend impls.
// Unlike blur there is NO CSS gradient-bevel, so only Gl has a meaningful native shader path; on
// Canvas/DOM the "native" tile is the same composited surface bitmap as the reference tile and parity
// holds by construction. This test draws two tiles side by side:
//   REFERENCE tile — the source bevelled on the CPU via applyGradientBevelFilterToSurface, the mask
//     composited over the source, blitted as a plain bitmap. Identical bytes on every backend; it is
//     the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path. On Gl: the
//     source bitmap drawn at the tile, with the gradient-bevel SHADER mask composited over it. On
//     Canvas/DOM: the composited reference bitmap (no native CSS bevel exists).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// bevel ≈ the CPU bevel. It also asserts the native tile is not blank and carries the tinted bevel
// edges, so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts) and app.ts calls drawNativeGradientBevel unconditionally — it is a no-op on Canvas/DOM.
// It imports createParityTarget from ./render (the local barrel); the functional vite harness routes
// ./render to the active backend's render.<renderer>.ts at runtime.
import { createGradientBevelFilter } from '@flighthq/filters';
import { applyGradientBevelFilterToSurface } from '@flighthq/filters-surface';
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
const SQUARE = 96;
const INSET = (TILE - SQUARE) / 2; // centered square: x/y in [80, 176)
const SQUARE_MIN = INSET;
const SQUARE_MAX = INSET + SQUARE;
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Inner gradient bevel: a red → gray → blue ramp, light down-right (45°). Reused verbatim from the
// validated filter-gradient-bevel test so the surface reference math is identical.
const filter = createGradientBevelFilter({
  bevelType: 'inner',
  colors: [0xff0000, 0x808080, 0x0000ff],
  alphas: [1, 1, 1],
  ratios: [0, 128, 255],
  angle: 45,
  distance: 8,
  blurX: 4,
  blurY: 4,
  strength: 2,
});

// Source: centered opaque mid-gray square on a TRANSPARENT field. The gradient bevel reads the source
// ALPHA channel to find edges, so the square must be the only opaque content. Reused from the
// validated test.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, INSET, INSET, SQUARE, SQUARE), 0x808080ff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: applyGradientBevelFilterToSurface writes a tinted edge MASK; composite it source-over
// onto a copy of the source to complete the effect. This is the oracle's ground truth and the bytes
// drawn into the REFERENCE tile on every backend.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyGradientBevelFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

const referenceData = new Uint8ClampedArray(source.data);
for (let i = 0; i < referenceData.length; i += 4) {
  const ma = mask[i + 3] / 255;
  if (ma === 0) continue;
  const inv = 1 - ma;
  referenceData[i] = mask[i] * ma + referenceData[i] * inv;
  referenceData[i + 1] = mask[i + 1] * ma + referenceData[i + 1] * inv;
  referenceData[i + 2] = mask[i + 2] * ma + referenceData[i + 2] * inv;
  referenceData[i + 3] = mask[i + 3] + referenceData[i + 3] * inv;
}
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-bevelled bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — the source bitmap at the native position.
//   Canvas/DOM: this IS the composited reference (no native CSS bevel); we blit the reference bytes so
//     the native tile equals the reference by construction.
//   Gl: we blit the raw SOURCE bytes here; drawNativeGradientBevel composites the shader bevel mask
//     over it, reproducing the same source + mask composite the reference does.
const nativeIsShader = target.kind === 'webgl';
addNodeChild(root, makeBitmap(nativeIsShader ? source.data : referenceData, NATIVE_X, TOP));

target.drawNativeGradientBevel?.({
  source: sourceImage,
  filter,
  x: NATIVE_X,
  y: TOP,
  tile: TILE,
});

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it
// back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated for a soft inner gradient bevel: the tinted edge is
// a thin soft band along the inner square edges, and the shader (box-blur basis + linear ramp lookup)
// disagrees with the CPU (gaussian-ish) bevel mainly in that band's anti-aliasing and exact tint
// position — a minority of the tile, but blurry/soft, so the tolerance is generous like the blur test.
// Tighten once real captures pin down the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 48;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the centre of the square must carry the opaque gray fill, not just the background.
  const centreGreen = green(getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2));
  if (centreGreen <= 40) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] native tile blank/dark at centre — got green ${centreGreen}`,
    );
  }

  // 2) Actually bevelled: scan the inner top-left edge for a strongly RED pixel (ramp start 0xff0000)
  //    and the inner bottom-right edge for a strongly BLUE pixel (ramp end 0x0000ff). A no-op native
  //    path would leave both edges flat gray (R≈B≈128).
  const redEdge = scanReddest(nativeTile, SQUARE_MIN + 8, SQUARE_MIN + 8);
  const blueEdge = scanBluest(nativeTile, SQUARE_MAX - 8, SQUARE_MAX - 8);
  const rr = (redEdge >> 16) & 255;
  const rb = redEdge & 255;
  if (!(rr - rb > 30)) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] top-left bevel edge not red (R-B>30), got #${hex(redEdge)}`,
    );
  }
  const br = (blueEdge >> 16) & 255;
  const bb = blueEdge & 255;
  if (!(bb - br > 30)) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] bottom-right bevel edge not blue (B-R>30), got #${hex(blueEdge)}`,
    );
  }

  // 3) Parity: the native bevel matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] native bevel diverges from CPU reference — ` +
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

// Walk a short diagonal band around (cx, cy) and return the most-red / most-blue sample, so a thin
// tinted bevel edge that drifts a pixel or two between the CPU and the shader is still caught.
function scanReddest(tile: Readonly<Surface>, cx: number, cy: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let d = -6; d <= 6; d++) {
    const rgb = getSurfacePixelRgb(tile, cx + d, cy + d);
    const score = ((rgb >> 16) & 255) - (rgb & 255);
    if (score > bestScore) {
      bestScore = score;
      best = rgb;
    }
  }
  return best;
}

function scanBluest(tile: Readonly<Surface>, cx: number, cy: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let d = -6; d <= 6; d++) {
    const rgb = getSurfacePixelRgb(tile, cx + d, cy + d);
    const score = (rgb & 255) - ((rgb >> 16) & 255);
    if (score > bestScore) {
      bestScore = score;
      best = rgb;
    }
  }
  return best;
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
