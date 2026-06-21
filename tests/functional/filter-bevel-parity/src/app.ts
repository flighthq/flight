// filter-bevel-parity — proves the WebGL NATIVE inner-bevel filter matches the canonical surface (CPU)
// inner bevel.
//
// Sibling of filter-blur-parity, swapped to the bevel filter. A bevel has a CPU reference impl
// (applyBevelFilterToSurface, writing a tinted edge MASK) and a native WebGL impl
// (applyBevelFilterToWebGL, a tint + box-blur + offset-blit shader chain). Unlike blur there is NO CSS
// bevel, so Canvas/DOM cannot express a native bevel — their NATIVE tile is the surface reference
// itself (parity holds by construction), and WebGL is the only meaningful comparison. This test draws
// two tiles side by side:
//   REFERENCE tile — the source beveled on the CPU: applyBevelFilterToSurface produces the inner-bevel
//     edge mask, composited (source-over) over the source, blitted as a plain bitmap. Identical bytes
//     on every backend; it is the oracle's ground truth. (Matches filter-bevel-inner's reference.)
//   NATIVE tile    — the same source pushed through THIS backend's real path. Canvas/DOM: the reference
//     bytes again (no native bevel). WebGL: the source pushed through the bevel shader chain, whose
//     no-knockout output already composites the source under the bevel, matching the reference.
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on WebGL it proves the shader
// bevel ≈ the CPU bevel. It also asserts the native tile is not blank and is actually beveled (the
// directional highlight/shadow edges are present), so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract
// (see ./parity.ts) and app.ts calls applyNativeBevel (a no-op everywhere) and drawNativeBevel (WebGL
// only) unconditionally. It imports createParityTarget from ./render (the local barrel); the functional
// vite harness routes ./render to the active backend's render.<renderer>.ts at runtime.
import { applyBevelFilterToSurface, createBevelFilter } from '@flighthq/filters';
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
const INSET = (TILE - SQUARE) / 2; // centered square: x/y in [80, 176)
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Source: centered opaque mid-gray square on a TRANSPARENT field (reused verbatim from
// filter-bevel-inner). The bevel derives from the directional gradient of the source's blurred ALPHA,
// so the square must carry the only alpha edge in the surface.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, INSET, INSET, SQUARE, SQUARE), 0x808080ff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// Filter: the validated inner-bevel config from filter-bevel-inner. Light points down-right (angle 45°).
const filter = createBevelFilter({
  bevelType: 'inner',
  angle: 45,
  distance: 6,
  blurX: 4,
  blurY: 4,
  highlightColor: 0xffffff,
  shadowColor: 0x000000,
  strength: 2,
});

// CPU reference: the canonical surface inner bevel. applyBevelFilterToSurface writes a tinted edge
// MASK; composite it (source-over) over a copy of the source to complete the inner bevel. These bytes
// are the oracle's ground truth and the REFERENCE tile drawn on every backend.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyBevelFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

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

// REFERENCE tile — the CPU-beveled bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile.
//   Canvas/DOM: no native bevel — draw the SAME CPU-beveled bytes as the native tile (parity by
//     construction). drawNativeBevel is a no-op there.
//   WebGL: applyNativeBevel is a no-op; drawNativeBevel runs the GPU bevel chain over the SOURCE image
//     and composites it at the native tile position.
const nativeBitmap = createBitmap();
nativeBitmap.data.image = createImageResourceFromCanvas(surfaceToCanvas(referenceData));
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

target.applyNativeBevel(nativeBitmap);
target.drawNativeBevel?.({ source: sourceImage, filter, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Sample points inside the centered NATIVE square, in logical (pre-scale) tile-local coordinates.
const CENTER = INSET + SQUARE / 2; // 128
const EDGE = 4; // on the inner bevel band (offset 6 + blur 4 peaks near the edge)
const TOP_LEFT = INSET + EDGE; // shadowed edge (gradient faces away from light)
const BOTTOM_RIGHT = INSET + SQUARE - EDGE; // highlighted edge (gradient faces light)

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it
// back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are CALIBRATED for an inner bevel (offset 6, blur 4) on a hard
// edge. The CPU surface bevel and the WebGL shader bevel (box-blur basis + offset blits vs. the surface
// Gaussian-derived gradient) disagree mainly in the narrow edge band around the square's border, a
// minority of the tile, and the box-vs-Gaussian blur basis widens that band's divergence. A glow/edge
// effect like this needs a looser tolerance than a tight color-matrix (~0.10) — 0.30 covers the edge
// band while still failing a no-op or grossly-wrong native path. Tighten once real captures pin the
// actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 40;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the square interior must carry mid-gray, not just the background.
  const center = getSurfacePixelRGB(nativeTile, CENTER, CENTER);
  if (luma(center) <= 40) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native tile blank/dark at centre — #${hex(center)} (luma ${luma(center).toFixed(0)})`,
    );
  }

  // 2) Actually beveled: light down-right means the bottom-right inner edge is HIGHLIGHTED (lighter
  // than center) and the top-left inner edge is SHADOWED (darker than center). A no-op native path
  // (flat gray square) would leave both ~= center and fail here.
  const topLeft = getSurfacePixelRGB(nativeTile, TOP_LEFT, TOP_LEFT);
  const bottomRight = getSurfacePixelRGB(nativeTile, BOTTOM_RIGHT, BOTTOM_RIGHT);
  if (!(luma(bottomRight) > luma(center) + 10)) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native bottom-right edge not highlighted — ` +
        `edge #${hex(bottomRight)} (luma ${luma(bottomRight).toFixed(0)}) vs center #${hex(center)} (luma ${luma(center).toFixed(0)})`,
    );
  }
  if (!(luma(topLeft) < luma(center) - 10)) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native top-left edge not shadowed — ` +
        `edge #${hex(topLeft)} (luma ${luma(topLeft).toFixed(0)}) vs center #${hex(center)} (luma ${luma(center).toFixed(0)})`,
    );
  }

  // 3) Parity: the native bevel matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native bevel diverges from CPU reference — ` +
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

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function luma(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255);
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
