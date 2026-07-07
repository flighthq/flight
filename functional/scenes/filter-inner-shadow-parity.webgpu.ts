import { createInnerShadowFilter } from '@flighthq/filters';
import { applyInnerShadowFilterToSurface } from '@flighthq/filters-surface';
import type { DisplayObject, Matrix, Surface, WgpuRenderState, WgpuRenderTarget } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyInnerShadowFilterToWgpu,
  beginWgpuRenderTarget,
  compositeSurfacePixels,
  compositeSurfaceRegion,
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

import type { NativeInnerShadowSpec, ParityTarget } from './parity';

// Wgpu backend of the filter-inner-shadow-parity test. Mechanical port of render.webgl.ts to the Wgpu offscreen-filter
// flow (see filter-blur-parity/render.webgl.ts for the annotated reference): render the source into an
// offscreen target with a baked vertical flip, run applyInnerShadowFilterToWgpu over offscreen targets, then composite the
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

  const pending: NativeInnerShadowSpec[] = [];

  return {
    kind: 'webgpu',
    width,
    height,
    scale: pixelRatio,
    applyNativeInnerShadow(): void {},
    drawNativeInnerShadow(spec: Readonly<NativeInnerShadowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderFrame(state, root, pending);
      pending.length = 0;
    },
  };
}

function renderFrame(state: WgpuRenderState, root: DisplayObject, specs: readonly NativeInnerShadowSpec[]): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWgpuBackground(state);
  renderWgpuDisplayObject(state, root);
  const toDestroy: WgpuRenderTarget[] = [];
  for (const spec of specs) compositeNative(state, spec, toDestroy);
  submitWgpuRenderPass(state);
  for (const target of toDestroy) destroyWgpuRenderTarget(state, target);
}

function compositeNative(
  state: WgpuRenderState,
  spec: Readonly<NativeInnerShadowSpec>,
  toDestroy: WgpuRenderTarget[],
): void {
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
  applyInnerShadowFilterToWgpu(state, sourceTarget, destTarget, [scratch0, scratch1, scratch2], {
    alpha: spec.filter.alpha,
    angle: spec.filter.angle,
    blurX: spec.filter.blurX,
    blurY: spec.filter.blurY,
    color: spec.filter.color,
    distance: spec.filter.distance,
    quality: spec.filter.quality,
    strength: spec.filter.strength,
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

const TILE = 256;
const SQUARE = 160;
const SQUARE_MIN = (TILE - SQUARE) / 2; // 48
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0x000000ff; // opaque black (packed RGBA); the tiles' transparent regions reveal it.

// The inner-shadow descriptor — shared by the surface reference and the Gl native path so both run the
// same effect. Matches the validated filter-inner-shadow test's config.
const FILTER = createInnerShadowFilter({ distance: 8, angle: 45, color: 0x000000, blurX: 4, blurY: 4, strength: 1 });

// Source: a centered 160×160 opaque-white square on transparent black (packed RGBA). The inner shadow
// extracts inverted alpha, so the source needs a real alpha edge (unlike blur's opaque tile).
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);
const sourceCanvas = surfaceToCanvas(source.data);
const sourceImage = createImageResourceFromCanvas(sourceCanvas);

// CPU reference: the canonical surface inner shadow, composited over the opaque BACKGROUND. Produce the
// inner-shadow mask, then source-over the source and the mask (source first, mask on top — the shadow
// hugs the inside of the shape boundary) onto a BACKGROUND-filled base. Layering over the opaque base
// both composites and flattens in one step (source-over is associative), so the result is fully opaque,
// matching what the rendered frame shows. This matters because the native tile is cropped from a frame
// drawn over the opaque background and getSurfaceMismatch compares alpha — a transparent reference would
// mismatch every background pixel (the majority of the tile).
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurScratch = new Uint8ClampedArray(TILE * TILE * 4);
applyInnerShadowFilterToSurface(mask, blurScratch, createSurfaceRegion(source), FILTER);

const referenceSurface = createSurface(TILE, TILE, BACKGROUND);
const referenceData = referenceSurface.data;
const referenceRegion = createSurfaceRegion(referenceSurface);
compositeSurfaceRegion(referenceRegion, createSurfaceRegion(source));
compositeSurfacePixels(referenceRegion, mask);

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
