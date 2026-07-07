import { createOuterGlowFilter } from '@flighthq/filters';
import { applyOuterGlowFilterToSurface } from '@flighthq/filters-surface';
import type { DisplayObject, Matrix, Surface, WgpuRenderState, WgpuRenderTarget } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyOuterGlowFilterToWgpu,
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

// Wgpu backend of the filter-outer-glow-parity test. Mechanical port of render.webgl.ts to the Wgpu offscreen-filter
// flow (see filter-blur-parity/render.webgl.ts for the annotated reference): render the source into an
// offscreen target with a baked vertical flip, run applyOuterGlowFilterToWgpu over offscreen targets, then composite the
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
  applyOuterGlowFilterToWgpu(state, sourceTarget, destTarget, [scratch0, scratch1, scratch2], {
    color: spec.filter.color,
    alpha: spec.filter.alpha,
    blurX: spec.filter.blurX,
    blurY: spec.filter.blurY,
    strength: spec.filter.strength,
    quality: spec.filter.quality,
    knockout: spec.filter.knockout,
  });
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

// filter-outer-glow-parity — proves each backend's NATIVE outer-glow filter matches the canonical
// surface (CPU) outer glow. Modeled exactly on filter-blur-parity.
//
// A filter has a CPU reference impl (applyOuterGlowFilterToSurface) and native per-backend impls (a CSS
// drop-shadow for DOM/Canvas, a tint+box-blur shader chain for Gl). This test draws two tiles side
// by side:
//   REFERENCE tile — the source glowed on the CPU via applyOuterGlowFilterToSurface, then composited
//     with the source on top (glow mask under, source over), blitted as a plain bitmap. Identical bytes
//     on every backend; it is the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path (CSS drop-shadow on
//     DOM/Canvas, the tint+blur+composite shader chain on Gl).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader glow
// ≈ the CPU glow, and on Canvas it proves the CSS glow ≈ the CPU glow. It also asserts the native tile's
// square center is still white and a green glow ring spills outside the edges, so a silently no-op
// native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts) and app.ts calls applyNativeGlow (CSS backends) and drawNativeGlow (shader backends)
// unconditionally — the inactive one is a no-op on each backend. It imports createParityTarget from
// ./render (the local barrel); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime, the same way filter-blur-parity does.

const TILE = 256;
const SQUARE = 96;
const SQUARE_X = (TILE - SQUARE) / 2; // 80
const SQUARE_Y = (TILE - SQUARE) / 2; // 80
const SQUARE_MAX_X = SQUARE_X + SQUARE; // 176
const SQUARE_MAX_Y = SQUARE_Y + SQUARE; // 176
const REFERENCE_X = 120;
const NATIVE_X = 424;

// Outer-glow params (reused from filter-outer-glow). Symmetric blur — computeOuterGlowFilterCss returns
// null for anisotropic blur, so the CSS backends require blurX === blurY. 8px keeps the glow well inside
// the tile. Green glow on transparent so the ring is unambiguous to sample.
const GLOW_COLOR = 0x00ff00;
const GLOW_BLUR = 8;
const GLOW_STRENGTH = 2;
const GLOW_ALPHA = 1;

const WIDTH = 800;
const HEIGHT = 600;
// Opaque black in the SDK's packed-RGBA convention (0xRRGGBBAA). The source tile is transparent
// around the glow, so the background shows through the native tile's transparent regions; it must be
// opaque or those pixels read back alpha 0 on WebGPU (which honors premultiplied alpha) and diverge
// from the alpha-255-flattened reference. 0xff000000 (ARGB) would be red-with-alpha-0 — the wrong value.
const BACKGROUND = 0x000000ff;

function glowFilter() {
  return createOuterGlowFilter({
    color: GLOW_COLOR,
    blurX: GLOW_BLUR,
    blurY: GLOW_BLUR,
    strength: GLOW_STRENGTH,
    alpha: GLOW_ALPHA,
  });
}

// Source: transparent-black tile with a centred 96×96 opaque-white square (packed RGBA). The hard
// silhouette edge makes the glow ring spilling outside it unambiguous to sample.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_X, SQUARE_Y, SQUARE, SQUARE), 0xffffffff);
const sourceCanvas = surfaceToCanvas(source.data);
const sourceImage = createImageResourceFromCanvas(sourceCanvas);

// CPU reference: the canonical surface outer glow writes a tinted, blurred alpha MASK of the silhouette.
// To complete the effect we composite the glow mask first, then the original source over it (straight-
// alpha over). This is the oracle's ground truth and the bytes drawn into the REFERENCE tile on every
// backend — and it mirrors what the native paths produce (CSS drop-shadow draws the glow behind the
// node; the Gl chain composites source over glow in dest).
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurScratch = new Uint8ClampedArray(TILE * TILE * 4);
applyOuterGlowFilterToSurface(mask, blurScratch, createSurfaceRegion(source), glowFilter());

const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
{
  const src = source.data;
  for (let i = 0; i < referenceData.length; i += 4) {
    const sa = src[i + 3] / 255;
    const ma = mask[i + 3] / 255;
    const outA = sa + ma * (1 - sa);
    for (let c = 0; c < 3; c++) {
      const sc = src[i + c];
      const mc = mask[i + c];
      referenceData[i + c] = outA > 0 ? Math.round((sc * sa + mc * ma * (1 - sa)) / outA) : 0;
    }
    referenceData[i + 3] = Math.round(outA * 255);
  }
}
// Flatten alpha to 255 so the reference matches the alpha:false canvas readback.
for (let i = 3; i < referenceData.length; i += 4) referenceData[i] = 255;
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-glowed/composited bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — the source bitmap, glowed the native way for this backend.
//   CSS backends: bind a drop-shadow() filter to this node; the normal render rasterizes it.
//   Shader backends: applyNativeGlow is a no-op; drawNativeGlow runs the GPU chain and composites it.
const nativeBitmap = createBitmap();
nativeBitmap.data.image = sourceImage;
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

target.applyNativeGlow(nativeBitmap, glowFilter());
target.drawNativeGlow?.({ source: sourceImage, filter: glowFilter(), x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it
// back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated for an 8px symmetric green glow on a hard silhouette
// edge. This is a blurry/glow effect, so the tolerance is loose (~0.30), matching filter-blur-parity:
// the CSS drop-shadow (no strength multiplier), the Gl tint+box-blur chain, and the CPU Gaussian glow
// disagree in the soft ring band around the silhouette, a minority of the tile. The square center
// (white) and far corners (black) agree exactly, anchoring parity; the ring's brightness/falloff is
// where the kernels diverge. Tighten once real captures pin down actual divergence; loosen only with a
// noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 40;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Square center still white: the source sits on top of the glow, unobscured.
  const center = getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2);
  if (!channelsClose(center, 0xffffff, 32)) {
    throw new Error(`[filter-outer-glow-parity:${render()}] square center expected white, got #${hex(center)}`);
  }

  // 2) Actually glowed: just outside the silhouette edge the green ring must be present and green-dominant.
  // A no-op native path would leave these pixels at the transparent/black background.
  const off = 3;
  const ringSamples: ReadonlyArray<readonly [number, number]> = [
    [TILE / 2, SQUARE_Y - off], // above top edge
    [TILE / 2, SQUARE_MAX_Y + off], // below bottom edge
    [SQUARE_X - off, TILE / 2], // left of left edge
    [SQUARE_MAX_X + off, TILE / 2], // right of right edge
  ];
  for (const [lx, ly] of ringSamples) {
    const got = getSurfacePixelRgb(nativeTile, lx, ly);
    const r = (got >> 16) & 255;
    const g = (got >> 8) & 255;
    const b = got & 255;
    if (!(g > 40 && g >= r && g >= b)) {
      throw new Error(
        `[filter-outer-glow-parity:${render()}] glow ring missing at (${lx},${ly}); expected green, got #${hex(got)}`,
      );
    }
  }

  // 3) Parity: the native glow matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-outer-glow-parity:${render()}] native glow diverges from CPU reference — ` +
        `${(mismatch.fraction * 100).toFixed(1)}% of pixels mismatched (max ${MISMATCH_FRACTION * 100}%), ` +
        `maxChannelDelta ${mismatch.maxChannelDelta}`,
    );
  }
}

function channelsClose(a: number, b: number, tol: number): boolean {
  return (
    Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= tol &&
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= tol &&
    Math.abs((a & 255) - (b & 255)) <= tol
  );
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
