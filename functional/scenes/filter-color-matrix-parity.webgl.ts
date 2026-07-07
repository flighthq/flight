import { createColorMatrixFilter } from '@flighthq/filters';
import { applyColorMatrixFilterToSurface } from '@flighthq/filters-surface';
import type { Bitmap, ColorMatrixFilter, DisplayObject, GlRenderState, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyColorMatrixFilterToGl,
  beginGlRenderTarget,
  createBitmap,
  createDisplayContainer,
  createGlCanvasElement,
  createGlRenderState,
  createGlRenderTarget,
  createImageResourceFromCanvas,
  createMatrix,
  createSurface,
  createSurfaceFromCanvas,
  createSurfaceRegion,
  defaultGlBitmapRenderer,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
  endGlRenderTarget,
  fillSurfaceRectangle,
  getGlRenderStateRuntime,
  getOrCreateRenderProxy2D,
  getSurfaceMismatch,
  getSurfacePixelRgb,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { NativeColorMatrixSpec, ParityTarget } from './parity';

// Gl backend of the color-matrix-parity test.
//
// Native path: the real Gl color-matrix is a SINGLE-PASS fragment shader (applyColorMatrixFilterToGl)
// run once over an offscreen render target, then composited onto the screen as a positioned quad. This
// mirrors the engine's render-cache flow (packages/displayobject-gl/src/webglCache.ts): render content into a
// target, run the GPU pass, composite the result via drawGlRenderTargetResult.
//
// Unlike blur (separable, multi-pass, ping-pong temp), color-matrix needs only source → dest:
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applyColorMatrixFilterToGl(state, source, dest, { matrix }) — the single-pass shader. The
//      shader unmultiplies alpha, applies the 4×5 matrix, re-premultiplies; for opaque source pixels
//      this is an exact match to the CPU surface transform.
//   3. bindScreenFramebuffer, then prepare a placement bitmap node at the native tile position to harvest
//      its world×device transform, and drawGlRenderTargetResult(state, proxy, dest, identity) to
//      composite the TILE×TILE result at that position (the composite V-flips, matching how step 1 wrote
//      the target — same convention the render cache relies on, so the result lands upright).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU transform runs at the same
// resolution the CPU reference does; the composite upscales by the device transform exactly as the
// reference bitmap tile does. There is no temp target and no gradient-ramp / displacement-map texture —
// color-matrix takes none.

export function createParityTarget(width: number, height: number, background: number): ParityTarget {
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = createGlCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createGlRenderState(canvas, {
    pixelRatio,
    backgroundColor: background,
    // preserveDrawingBuffer so the verifier can read the frame back after rendering.
    contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  });
  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing store.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  registerDefaultGlMaterial(state);
  registerRenderer(state, BitmapKind, defaultGlBitmapRenderer);

  registerFunctionalTarget({
    kind: 'webgl',
    state,
    width,
    height,
    scale: pixelRatio,
    render: (root: DisplayObject) => renderParity(state, root),
  });

  // Pending GPU passes, applied after the scene draws (so the composite lands over the background/tiles).
  const pending: NativeColorMatrixSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    drawNativeColorMatrix(spec: Readonly<NativeColorMatrixSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeColorMatrix(state, spec);
      pending.length = 0;
    },
  };
}

// Renders `source` into `target` filling its 0..size viewport, via an identity render transform.
function renderSourceIntoTarget(state: GlRenderState, source: Bitmap, target: GlRenderTarget): void {
  beginGlRenderTarget(state, target, _identity);
  state.gl.clearColor(0, 0, 0, 0);
  state.gl.clear(state.gl.COLOR_BUFFER_BIT);
  prepareDisplayObjectRender(state, source);
  renderGlDisplayObject(state, source);
  endGlRenderTarget(state);
}

function compositeNativeColorMatrix(state: GlRenderState, spec: Readonly<NativeColorMatrixSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  // Color-matrix is single-pass: only source → dest. No ping-pong temp target.
  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl color-matrix: one fullscreen fragment pass. The filter's `matrix` is the same 20-value
  // OpenFL-order matrix the CPU reference used (passed straight through from app.ts).
  const filter: Readonly<ColorMatrixFilter> = spec.filter;
  applyColorMatrixFilterToGl(state, sourceTarget, destTarget, { matrix: filter.matrix });

  // The pass (drawGlFullscreenPass) leaves the dest framebuffer bound and a tile-sized viewport — it
  // does not restore the screen. The render cache avoids this because its composite runs during the
  // on-screen walk; this inline flow must rebind the default framebuffer and full-canvas viewport itself
  // before compositing, or the result would draw into the filter target, not the screen.
  bindScreenFramebuffer(state);

  // Placement node carries the world×device transform that positions the TILE×TILE result at the native
  // tile. It is NOT part of the rendered scene tree (it would double-draw); we prepare it only to harvest
  // its render proxy's transform2D, then composite the dest target through that transform.
  const placement = createBitmap();
  placement.x = spec.x;
  placement.y = spec.y;
  prepareDisplayObjectRender(state, placement);
  const proxy = getOrCreateRenderProxy2D(state, placement);

  // dest is composited as a (0,0,size,size) quad through proxy.transform2D; identity inner transform,
  // exactly like the render-cache composite (drawGlRenderCache passes _identity).
  drawGlRenderTargetResult(state, proxy, destTarget, _identity);

  // The render targets own framebuffers/textures the GC will not free.
  destroyGlRenderTarget(state, sourceTarget);
  destroyGlRenderTarget(state, destTarget);
}

// Rebinds the default (screen) framebuffer and the full-canvas viewport, and resets the runtime's cached
// framebuffer/viewport so subsequent draws target the screen. Mirrors the state the screen walk runs
// under (framebuffer null, renderTargetViewport null → viewport = canvas).
function bindScreenFramebuffer(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, state.canvas.width, state.canvas.height);
  runtime.currentFramebuffer = null;
  runtime.renderTargetViewport = null;
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;
  runtime.currentProgram = null;
}

function renderParity(state: GlRenderState, root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderGlBackground(state);
  renderGlDisplayObject(state, root);
}

const _identity = createMatrix();

// filter-color-matrix-parity — proves the NATIVE per-backend color-matrix filter matches the canonical
// surface (CPU) color-matrix transform.
//
// Sibling of filter-blur-parity, swapping the blur for a 4×5 color matrix. A filter has a CPU reference
// impl (apply*FilterToSurface) and native per-backend impls. This test draws two tiles side by side:
//   REFERENCE tile — the source transformed on the CPU via applyColorMatrixFilterToSurface, blitted as a
//     plain bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path.
// Color-matrix has NO CSS form, so on Canvas/DOM the "native" tile is the CPU result itself (parity by
// construction); Gl is the meaningful comparison — its single-pass color-matrix shader vs the CPU.
//
// Color-matrix is a direct per-pixel transform (no compositing, no soft edges), so the shader and the
// CPU matrix maths agree closely — this is the TIGHTEST parity in the suite, hence a low tolerance. The
// oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and asserts
// the mismatch fraction is below a calibrated tolerance, plus a not-blank/actually-transformed guard so
// a silent no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts). app.ts calls drawNativeColorMatrix unconditionally — it is a no-op on Canvas/DOM and the
// real GPU pass on Gl. It imports createParityTarget from ./render (the local barrel); the functional
// vite harness routes ./render to the active backend's render.<renderer>.ts at runtime.

const TILE = 256;
const HALF = TILE / 2;
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0x000000ff;

// Source: 4-quadrant red / green / blue / white (packed RGBA, opaque) — the same known pattern the
// validated filter-color-matrix test uses. A hard 4-colour split makes the per-channel transform
// unambiguous to sample and gives the oracle exact ground-truth colours.
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, 0, 0, HALF, HALF), 0xff0000ff);
fillSurfaceRectangle(createSurfaceRegion(source, HALF, 0, HALF, HALF), 0x00ff00ff);
fillSurfaceRectangle(createSurfaceRegion(source, 0, HALF, HALF, HALF), 0x0000ffff);
fillSurfaceRectangle(createSurfaceRegion(source, HALF, HALF, HALF, HALF), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// Invert: channel' = 255 − channel; alpha unchanged. 4×5 row-major matrix (OpenFL/Flash order). The
// same matrix runs on the CPU reference and the Gl shader, so parity is a direct equality check.
const INVERT = [-1, 0, 0, 0, 255, 0, -1, 0, 0, 255, 0, 0, -1, 0, 255, 0, 0, 0, 1, 0];
const filter = createColorMatrixFilter(INVERT);

// CPU reference: the canonical surface color-matrix transform. This is the oracle's ground truth and the
// bytes drawn into the REFERENCE tile on every backend.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
applyColorMatrixFilterToSurface(referenceData, createSurfaceRegion(source), filter);
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-transformed bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile.
//   Canvas/DOM: no CSS color-matrix exists, so the native tile IS the CPU result bitmap — parity by
//     construction. We draw the reference bytes again here so the tile is present for the not-blank guard.
//   Gl: the source bitmap is drawn here only as a placeholder; drawNativeColorMatrix runs the GPU
//     shader pass and composites the real native result over this position after the scene draws.
const nativeBitmap = createBitmap();
nativeBitmap.data.image =
  target.kind === 'webgl' ? sourceImage : createImageResourceFromCanvas(surfaceToCanvas(referenceData));
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

target.drawNativeColorMatrix?.({ source: sourceImage, filter, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Oracle (runs for canvas/webgl; DOM has no canvas readback so its parity is best-effort via the
// not-blank harness check). Crops the NATIVE tile out of the device-scaled frame, scales it back to
// TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated TIGHT for color-matrix: a per-pixel transform with
// no compositing or soft edges, so the shader and CPU matrix maths agree to within rounding. The only
// divergence is 1-LSB quantization at the 4-colour seams (a thin minority of pixels) and 8-bit
// round-trip. Far tighter than blur-parity's 0.30 (which must absorb kernel-shape disagreement on a soft
// edge). Loosen only with a noted reason.
const MISMATCH_FRACTION = 0.1;
const CHANNEL_TOLERANCE = 8;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the tile must carry the inverted pattern, not just the background. The top-left
  // quadrant was red (0xff0000) → cyan (0x00ffff), so its green channel must be high.
  const tl = getSurfacePixelRgb(nativeTile, HALF / 2, HALF / 2);
  if (green(tl) <= 120) {
    throw new Error(
      `[filter-color-matrix-parity:${render()}] native tile blank — top-left green ${green(tl)} (expected cyan)`,
    );
  }

  // 2) Actually transformed (not the un-inverted source): the bottom-right quadrant was white
  // (0xffffff) → black (0x000000). A no-op native path would leave it white.
  const br = getSurfacePixelRgb(nativeTile, HALF + HALF / 2, HALF + HALF / 2);
  if (green(br) > 80) {
    throw new Error(
      `[filter-color-matrix-parity:${render()}] native filter not applied — bottom-right green ${green(br)} (expected ~0)`,
    );
  }

  // 3) Parity: the native color-matrix matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-color-matrix-parity:${render()}] native filter diverges from CPU reference — ` +
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
