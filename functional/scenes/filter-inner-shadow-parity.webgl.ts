import { createInnerShadowFilter } from '@flighthq/filters';
import { applyInnerShadowFilterToSurface } from '@flighthq/filters-surface';
import type { Bitmap, DisplayObject, GlRenderState, GlRenderTarget, InnerShadowFilter, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyInnerShadowFilterToGl,
  beginGlRenderTarget,
  compositeSurfacePixels,
  compositeSurfaceRegion,
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

import type { NativeInnerShadowSpec, ParityTarget } from './parity';

// Gl backend of the inner-shadow-parity test — the meaningful comparison this test exists for.
//
// Native path: the real Gl inner shadow is a multi-pass shader (applyInnerShadowFilterToGl) run
// over offscreen render targets, then composited onto the screen as a positioned quad. This mirrors the
// engine's own render-cache flow (packages/displayobject-gl/src/webglCache.ts): render content into a target,
// run the GPU passes, composite the result via drawGlRenderTargetResult.
//
// Unlike the blur native path, applyInnerShadowFilterToGl takes its scratch as a SINGLE array of three
// render targets (it ping-pongs internally), not three positional source/dest/temp args, and it produces
// the FINAL composited image (source + clipped inner shadow) directly into `dest` — so `dest` is what we
// composite, the same byte content the surface reference produced.
//
// Flow per drawNativeInnerShadow():
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applyInnerShadowFilterToGl(state, source, dest, [s0,s1,s2], filter) — the shader inner shadow.
//   3. bindScreenFramebuffer — the filter passes leave a scratch framebuffer/viewport bound; restore the
//      default framebuffer + full-canvas viewport before compositing onto the screen.
//   4. Prepare a placement bitmap node at the native tile position to harvest its world×device transform,
//      then drawGlRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result at
//      that position (the composite V-flips, matching how step 1 wrote the target).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU filter runs at the same
// resolution the CPU/surface reference filters at; the composite upscales by the device transform exactly
// as the reference bitmap tile does. This keeps the two tiles at matching effective resolution.

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

  // Pending GPU inner shadows, applied after the scene draws (so the composite lands over the tiles).
  const pending: NativeInnerShadowSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on Gl — the inner shadow is the GPU shader pass below.
    applyNativeInnerShadow(_node: Bitmap, _filter: Readonly<InnerShadowFilter>): void {},
    drawNativeInnerShadow(spec: Readonly<NativeInnerShadowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeInnerShadow(state, spec);
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

function compositeNativeInnerShadow(state: GlRenderState, spec: Readonly<NativeInnerShadowSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // applyInnerShadowFilterToGl ping-pongs across THREE scratch targets passed as one array.
  const scratch = [
    createGlRenderTarget(state, { width: size, height: size }),
    createGlRenderTarget(state, { width: size, height: size }),
    createGlRenderTarget(state, { width: size, height: size }),
  ];

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl inner shadow: invert-tint → blur → offset → clip-to-source-alpha → composite
  // (source + clipped shadow) into destTarget. Same filter config the surface reference used, minus the
  // `type` tag the Gl entry omits.
  applyInnerShadowFilterToGl(state, sourceTarget, destTarget, scratch, {
    alpha: spec.filter.alpha,
    angle: spec.filter.angle,
    blurX: spec.filter.blurX,
    blurY: spec.filter.blurY,
    color: spec.filter.color,
    distance: spec.filter.distance,
    quality: spec.filter.quality,
    strength: spec.filter.strength,
  });

  // The filter passes (drawGlFullscreenPass) leave a scratch framebuffer bound and a tile-sized
  // viewport — they do not restore the screen. The render cache avoids this because its composite runs
  // during the on-screen walk; this inline flow must rebind the default framebuffer and full-canvas
  // viewport itself before compositing, or the result would draw into a filter target, not the screen.
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
  for (const s of scratch) destroyGlRenderTarget(state, s);
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
