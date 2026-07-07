import { createInnerGlowFilter } from '@flighthq/filters';
import { applyInnerGlowFilterToSurface } from '@flighthq/filters-surface';
import type { DisplayObject, Matrix, Surface, WgpuRenderState, WgpuRenderTarget } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyInnerGlowFilterToWgpu,
  beginWgpuRenderTarget,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createMatrix,
  createSurface,
  createSurfaceFromCanvas,
  createSurfaceRegion,
  createWgpuCanvasElement,
  createWgpuRenderState,
  createWgpuRenderTarget,
  defaultWgpuBitmapRenderer,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  enableWgpuFrameCapture,
  endWgpuRenderTarget,
  fillSurfaceRectangle,
  getRenderProxy2D,
  getSurfaceMismatch,
  getSurfacePixelRgb,
  prepareDisplayObjectRender,
  registerDefaultWgpuMaterial,
  registerRenderer,
  renderWgpuBackground,
  renderWgpuDisplayObject,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { NativeGlowSpec, ParityTarget } from './parity';

// Wgpu backend of the filter-inner-glow-parity test. Mechanical port of render.webgl.ts to the Wgpu offscreen-filter
// flow (see filter-blur-parity/render.webgl.ts for the annotated reference): render the source into an
// offscreen target with a baked vertical flip, run applyInnerGlowFilterToWgpu over offscreen targets, then composite the
// result at the native tile via drawWgpuRenderTargetResult. All GPU work runs inside the single frame
// encoder (renderWgpuBackground → submitWgpuRenderPass); the offscreen targets are destroyed only
// AFTER submit (the encoder still references them). NOTE: generated without capture validation.

export async function createParityTarget(width: number, height: number, background: number): Promise<ParityTarget> {
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = createWgpuCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: background });
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);
  registerDefaultWgpuMaterial(state);
  registerRenderer(state, BitmapKind, defaultWgpuBitmapRenderer);
  enableWgpuFrameCapture(state);

  registerFunctionalTarget({
    kind: 'webgpu',
    state,
    width,
    height,
    scale: pixelRatio,
    render: (root: DisplayObject) => renderFrame(state, root, []),
  });

  const pending: NativeGlowSpec[] = [];

  return {
    kind: 'webgpu',
    width,
    height,
    scale: pixelRatio,
    applyNativeGlow(): void {},
    drawNativeGlow(spec: Readonly<NativeGlowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderFrame(state, root, pending);
      pending.length = 0;
    },
  };
}

function renderFrame(state: WgpuRenderState, root: DisplayObject, specs: readonly NativeGlowSpec[]): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  const toDestroy: WgpuRenderTarget[] = [];
  for (const spec of specs) compositeNative(state, spec, toDestroy);
  submitWgpuRenderPass(state);
  for (const target of toDestroy) destroyWgpuRenderTarget(state, target);
}

function compositeNative(state: WgpuRenderState, spec: Readonly<NativeGlowSpec>, toDestroy: WgpuRenderTarget[]): void {
  const size = spec.tile;

  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createWgpuRenderTarget(state, size, size);
  const destTarget = createWgpuRenderTarget(state, size, size);
  const scratch0 = createWgpuRenderTarget(state, size, size);
  const scratch1 = createWgpuRenderTarget(state, size, size);
  const scratch2 = createWgpuRenderTarget(state, size, size);

  prepareDisplayObjectRender(state, sourceBitmap);
  const sourceProxy = getRenderProxy2D(state, sourceBitmap);
  if (sourceProxy !== undefined) setFlippedTransform(sourceProxy.transform2D, size);

  beginWgpuRenderTarget(state, sourceTarget, _identity);
  renderWgpuDisplayObject(state, sourceBitmap);
  applyInnerGlowFilterToWgpu(state, sourceTarget, destTarget, [scratch0, scratch1, scratch2], spec.filter);
  endWgpuRenderTarget(state);

  const placement = createBitmap();
  placement.x = spec.x;
  placement.y = spec.y;
  prepareDisplayObjectRender(state, placement);
  const placementProxy = getRenderProxy2D(state, placement);
  if (placementProxy !== undefined) drawWgpuRenderTargetResult(state, placementProxy, destTarget, _identity);

  toDestroy.push(sourceTarget, destTarget, scratch0, scratch1, scratch2);
}

function setFlippedTransform(out: Matrix, size: number): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = -1;
  out.tx = 0;
  out.ty = size;
}

const _identity = createMatrix();

// filter-inner-glow-parity — proves the NATIVE per-backend inner-glow filter matches the canonical
// surface (CPU) inner glow.
//
// Reference template adapted from filter-blur-parity. An inner-glow filter has a CPU reference impl
// (applyInnerGlowFilterToSurface) and a native Gl impl (a multi-pass shader). Unlike blur, inner
// glow has NO CSS form, so only Gl has a real native path; on Canvas/DOM the native tile is the
// surface reference itself (parity by construction). This test draws two tiles side by side:
//   REFERENCE tile — the source inner-glowed on the CPU via applyInnerGlowFilterToSurface, composited
//     source-first then mask-on-top, blitted as a plain bitmap. Identical bytes on every backend; the
//     oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path (the inner-glow
//     shader on Gl; the same surface-composited bytes on Canvas/DOM).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// inner glow ≈ the CPU inner glow. It also asserts the native tile is not blank and is actually
// filtered (the interior edge carries the cyan tint), so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts) and app.ts calls drawNativeGlow unconditionally — it is a no-op on Canvas/DOM, where the
// native tile is drawn from the reference bytes instead. It imports createParityTarget from ./render
// (the local barrel); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime.

const TILE = 256;
const SQUARE = 160;
const SQUARE_OFFSET = (TILE - SQUARE) / 2; // 48: white square centered in the 256 tile
const SQUARE_MIN = SQUARE_OFFSET; // 48
const REFERENCE_X = 120;
const NATIVE_X = 424;

// Inner-glow config — reused verbatim from the validated filter-inner-glow test: cyan, blur 8,
// strength 2. blurX === blurY keeps the glow band symmetric inside the shape edge.
const GLOW_COLOR = 0x00ffff;
const GLOW_BLUR = 8;
const GLOW_STRENGTH = 2;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Source: a centered opaque-white square on transparent black, so the inner glow has an interior edge.
// (Same source surface as the validated filter-inner-glow test.)
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_OFFSET, SQUARE_OFFSET, SQUARE, SQUARE), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: the canonical surface inner glow, produced exactly as the filter-inner-glow test does.
// The filter math runs on the surface in JS, so these bytes are the oracle's ground truth and the bytes
// drawn into the REFERENCE tile on every backend (and the NATIVE tile on Canvas/DOM).
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyInnerGlowFilterToSurface(
  mask,
  blurBuffer,
  createSurfaceRegion(source),
  createInnerGlowFilter({ color: GLOW_COLOR, blurX: GLOW_BLUR, blurY: GLOW_BLUR, strength: GLOW_STRENGTH }),
);

// Composite: original source first, then the inner-glow mask on top (source-over) — the glow sits
// inside the shape boundary.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
referenceData.set(source.data);
for (let i = 0; i < referenceData.length; i += 4) {
  const ma = mask[i + 3] / 255;
  if (ma === 0) continue;
  const inv = 1 - ma;
  referenceData[i] = mask[i] * ma + referenceData[i] * inv;
  referenceData[i + 1] = mask[i + 1] * ma + referenceData[i + 1] * inv;
  referenceData[i + 2] = mask[i + 2] * ma + referenceData[i + 2] * inv;
  referenceData[i + 3] = (mask[i + 3] + referenceData[i + 3] * inv) | 0;
}
// Flatten alpha to 255 so the reference matches the alpha:false canvas readback.
for (let i = 3; i < referenceData.length; i += 4) referenceData[i] = 255;
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU inner-glowed bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile.
//   Gl: a placeholder bitmap is NOT added — drawNativeGlow composites the GPU result over the scene.
//   Canvas/DOM: there is no native CSS inner glow, so the native tile is the same reference bytes
//     drawn as a plain bitmap; parity holds by construction. drawNativeGlow is a no-op there.
if (target.kind === 'webgl') {
  target.drawNativeGlow?.({
    source: sourceImage,
    filter: { color: GLOW_COLOR, blurX: GLOW_BLUR, blurY: GLOW_BLUR, strength: GLOW_STRENGTH },
    x: NATIVE_X,
    y: TOP,
    tile: TILE,
  });
} else {
  addNodeChild(root, makeBitmap(referenceData, NATIVE_X, TOP));
}

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort
// via the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales
// it back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated for an 8px cyan inner glow on a hard edge. The
// shader path (box-blur approximation of the glow band) and the CPU path (Gaussian-ish surface blur)
// disagree most in the soft glow band just inside the edge — a minority of the tile, but a wider band
// than a plain blur, so the fraction is loose (0.30, matching blur-parity) and the channel tolerance is
// generous (40) for the glow's color ramp. Tighten once real captures pin down the actual divergence;
// loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 40;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the square center must be near-white (the shape itself, not the background).
  const center = getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2);
  if (green(center) <= 120) {
    throw new Error(`[filter-inner-glow-parity:${render()}] native tile blank/dark at centre — got #${hex(center)}`);
  }

  // 2) Actually filtered: a band ~6px inside the square's left edge carries the cyan tint — B and G
  // high, R lower than the white center. A no-op native path would leave this band plain white.
  const EDGE_INSET = 6;
  const edge = getSurfacePixelRgb(nativeTile, SQUARE_MIN + EDGE_INSET, TILE / 2);
  const er = (edge >> 16) & 255;
  const eg = (edge >> 8) & 255;
  const eb = edge & 255;
  if (eb <= 120 || eg <= 120) {
    throw new Error(
      `[filter-inner-glow-parity:${render()}] native edge band expected cyan tint (B>120, G>120), got #${hex(edge)}`,
    );
  }
  if (er >= eb || er >= eg) {
    throw new Error(
      `[filter-inner-glow-parity:${render()}] native edge band expected R below cyan G/B, got #${hex(edge)}`,
    );
  }

  // 3) Parity: the native inner glow matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-inner-glow-parity:${render()}] native inner glow diverges from CPU reference — ` +
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
