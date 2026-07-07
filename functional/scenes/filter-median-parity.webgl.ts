import { createMedianFilter } from '@flighthq/filters';
import { applyMedianFilterToSurface } from '@flighthq/filters-surface';
import type { Bitmap, DisplayObject, GlRenderState, GlRenderTarget, MedianFilter, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyMedianFilterToGl,
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
  getGlRenderStateRuntime,
  getOrCreateRenderProxy2D,
  getSurfaceMismatch,
  getSurfacePixelRgb,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
  setSurfacePixel,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { NativeMedianSpec, ParityTarget } from './parity';

// Gl backend of the median-parity test.
//
// Native path: the real Gl median is a SINGLE-pass shader (applyMedianFilterToGl — per-channel
// 5×5 median, no separable ping-pong, so no temp target) run over an offscreen render target, then
// composited onto the screen as a positioned quad. This mirrors the engine's own render-cache flow
// (packages/displayobject-gl/src/webglCache.ts): render content into a target, run the GPU pass, composite
// the result via drawGlRenderTargetResult.
//
// Flow per drawNativeMedian():
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applyMedianFilterToGl(state, source, dest, {radius}) — the single-pass shader median. Unlike
//      the blur, there is NO temp/scratch target: median is one pass source → dest.
//   3. Rebind the default framebuffer + full-canvas viewport (the fullscreen pass leaves dest bound),
//      prepare a placement bitmap node at the native tile position to harvest its world×device
//      transform, then drawGlRenderTargetResult(state, proxy, dest, identity) to composite the
//      TILE×TILE result at that position (the composite V-flips, matching how step 1 wrote the target —
//      same convention the render cache relies on, so the result lands upright).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU median runs at the same
// resolution the CPU/surface reference filters at; the composite upscales by the device transform
// exactly as the reference bitmap tile does. This keeps the two tiles at matching effective resolution.

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

  // Pending GPU medians, applied after the scene draws (so the composite lands over the background/tiles).
  const pending: NativeMedianSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on Gl (or any backend) for median — the filter is the GPU shader pass below.
    applyNativeMedian(_node: Bitmap, _filter: Readonly<MedianFilter>): void {},
    drawNativeMedian(spec: Readonly<NativeMedianSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeMedian(state, spec);
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

function compositeNativeMedian(state: GlRenderState, spec: Readonly<NativeMedianSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  // Median is a single pass: source → dest. No temp/scratch target (unlike the separable blur).
  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl median: per-channel 5×5 median, single pass. radius matches the surface reference.
  applyMedianFilterToGl(state, sourceTarget, destTarget, { radius: spec.radius });

  // The fullscreen pass (drawGlFullscreenPass) leaves the dest framebuffer bound and a tile-sized
  // viewport — it does not restore the screen. This inline flow must rebind the default framebuffer and
  // full-canvas viewport itself before compositing, or the result would draw into the median target.
  bindScreenFramebuffer(state);

  // Placement node carries the world×device transform that positions the TILE×TILE result at the
  // native tile. It is NOT part of the rendered scene tree (it would double-draw); we prepare it only
  // to harvest its render proxy's transform2D, then composite the dest target through that transform.
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

// Rebinds the default (screen) framebuffer and the full-canvas viewport, and resets the runtime's
// cached framebuffer/viewport so subsequent draws target the screen. Mirrors the state the screen walk
// runs under (framebuffer null, renderTargetViewport null → viewport = canvas).
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

// filter-median-parity — proves each backend's NATIVE median filter matches the canonical surface (CPU)
// median.
//
// Sibling of filter-blur-parity, for a filter with NO native CSS form. The median has a CPU reference
// impl (applyMedianFilterToSurface) and one real native impl: the Gl single-pass shader
// (applyMedianFilterToGl). There is no CSS median, so on Canvas/DOM the "native" tile is the CPU
// result itself (parity by construction) and Gl is the meaningful comparison. The test draws two
// tiles side by side:
//   REFERENCE tile — the source median-filtered on the CPU via applyMedianFilterToSurface, blitted as a
//     plain bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — on Gl, the same source pushed through the median shader and composited; on
//     Canvas/DOM, the same CPU-filtered bytes (no native CSS median exists).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// median ≈ the CPU median. It also asserts the native tile is not blank and that a former salt speck is
// removed (now blue), so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract
// (see ./parity.ts) and app.ts calls applyNativeMedian (no-op everywhere) and drawNativeMedian (the GPU
// pass on Gl, a no-op on Canvas/DOM) unconditionally. It imports createParityTarget from ./render
// (the local barrel); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime.

const TILE = 256;
const REFERENCE_X = 120;
const NATIVE_X = 424;
// Median radius 2 (a 5×5 neighborhood) — the Gl shader's maximum and the surface reference's value.
// A 5×5 median is dominated by the surrounding blue field, so each isolated red speck is replaced by blue.
const RADIUS = 2;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Source: solid opaque-blue field with scattered single-pixel red specks (salt noise) at known
// coordinates (packed RGBA). Isolated specks make the median's effect unambiguous to sample, and the
// flat field around them makes parity tight.
const source = createSurface(TILE, TILE, 0x0000ffff);
const SPECKS = [
  { x: 64, y: 64 },
  { x: 192, y: 48 },
  { x: 128, y: 128 },
  { x: 40, y: 200 },
  { x: 210, y: 180 },
  { x: 96, y: 220 },
];
for (const { x, y } of SPECKS) setSurfacePixel(source, x, y, 0xff0000ff);
const sourceCanvas = surfaceToCanvas(source.data);
const sourceImage = createImageResourceFromCanvas(sourceCanvas);

// CPU reference: the canonical surface median. This is the oracle's ground truth and the bytes drawn
// into the REFERENCE tile on every backend.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
applyMedianFilterToSurface(referenceData, createSurfaceRegion(source), createMedianFilter({ radius: RADIUS }));
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-median bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — the median the native way for this backend.
//   Canvas/DOM: no native CSS median exists, so draw the CPU result bitmap as the native tile too
//     (parity holds by construction; Gl is the meaningful comparison).
//   Gl: applyNativeMedian is a no-op; drawNativeMedian runs the GPU pass and composites it over the
//     placeholder tile below.
const nativeBitmap = createBitmap();
nativeBitmap.data.image =
  target.kind === 'webgl' ? sourceImage : createImageResourceFromCanvas(surfaceToCanvas(referenceData));
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

target.applyNativeMedian(nativeBitmap, createMedianFilter({ radius: RADIUS }));
target.drawNativeMedian?.({ source: sourceImage, radius: RADIUS, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it
// back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated for a radius-2 median on a flat blue field: median
// is a sharp, structure-preserving filter (not a blur), and the GPU and CPU kernels agree on the flat
// interior almost exactly — they diverge only at the tile border (the shader clamps texel sampling) and
// at the few speck neighborhoods. So the tolerance is tight (0.10) compared to the blurry blur-parity
// case (0.30). Tighten once real captures pin down the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.1;
const CHANNEL_TOLERANCE = 24;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the tile must carry the blue field, not just the background.
  const centre = getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2);
  if (blue(centre) <= 120) {
    throw new Error(`[filter-median-parity:${render()}] native tile blank/dark at centre — got blue ${blue(centre)}`);
  }

  // 2) Actually filtered: a former salt speck is now blue (the median removed the red), not the source's
  //    isolated red pixel. A no-op native path would leave it red (high red, low blue).
  const speck = SPECKS[2]; // (128, 128)
  const speckRgb = getSurfacePixelRgb(nativeTile, speck.x, speck.y);
  if (!isBlue(speckRgb)) {
    throw new Error(
      `[filter-median-parity:${render()}] former speck (${speck.x},${speck.y}) not filtered — ` +
        `expected blue, got red ${red(speckRgb)} blue ${blue(speckRgb)}`,
    );
  }

  // 3) Parity: the native median matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-median-parity:${render()}] native median diverges from CPU reference — ` +
        `${(mismatch.fraction * 100).toFixed(1)}% of pixels mismatched (max ${MISMATCH_FRACTION * 100}%), ` +
        `maxChannelDelta ${mismatch.maxChannelDelta}`,
    );
  }
}

function blue(rgb: number): number {
  return rgb & 255;
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

function isBlue(rgb: number): boolean {
  return blue(rgb) > 150 && red(rgb) < 80;
}

function makeBitmap(data: Uint8ClampedArray, x: number, y: number) {
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(surfaceToCanvas(data));
  bmp.data.smoothing = false;
  bmp.x = x;
  bmp.y = y;
  return bmp;
}

function red(rgb: number): number {
  return (rgb >> 16) & 255;
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
