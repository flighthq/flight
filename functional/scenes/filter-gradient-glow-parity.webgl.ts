import { createGradientGlowFilter } from '@flighthq/filters';
import { applyGradientGlowFilterToSurface } from '@flighthq/filters-surface';
import type { DisplayObject, GlRenderState, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyGradientGlowFilterToGl,
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

import type { NativeGradientGlowSpec, ParityTarget } from './parity';

// Gl backend of the gradient-glow-parity test — the meaningful comparison in this suite.
//
// Native path: the real Gl gradient glow is a multi-pass shader (a tint pass to extract the
// silhouette, a separable box blur, and a gradient-ramp lookup keyed off the blurred alpha) run over
// offscreen render targets via applyGradientGlowFilterToGl, then composited onto the screen as a
// positioned quad. This mirrors the engine's render-cache flow (packages/displayobject-gl/src/webglCache.ts):
// render content into a target, run the GPU passes, composite the result via drawGlRenderTargetResult.
//
// Unlike the Gaussian blur (applyGaussianBlurFilterToGl takes a single ping-pong `temp` target), the
// gradient glow takes a `scratch` ARRAY of three same-sized targets and builds its gradient ramp texture
// internally each call from filter.colors/alphas/ratios (createGlGradientRampTexture) — so this file
// allocates source + dest + three scratch targets, and passes no ramp/displacement texture of its own.
// It is a single call (no separate apply per pass) and clears `dest` itself.
//
// Flow per drawNativeGradientGlow():
//   1. createGlRenderTarget for source, dest, and three scratch targets (s0/s1/s2), all TILE-sized.
//   2. Render the source bitmap into the `source` target (beginGlRenderTarget with an identity render
//      transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   3. applyGradientGlowFilterToGl(state, source, dest, [s0,s1,s2], filter) — the shader glow.
//   4. bindScreenFramebuffer — the fullscreen passes leave a scratch framebuffer/viewport bound; rebind
//      the default framebuffer and full-canvas viewport before compositing onto the screen.
//   5. Prepare a placement bitmap node at the native tile position to harvest its world×device transform,
//      then drawGlRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result
//      at that position (the composite V-flips, matching how step 2 wrote the target — the same render
//      convention the cache relies on, so the result lands upright).
//   6. destroyGlRenderTarget for all five targets (they own framebuffers/textures the GC won't free).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU glow runs at the same
// resolution the CPU/surface reference glows at; the composite upscales by the device transform exactly
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

  // Pending GPU glows, applied after the scene draws (so the composite lands over the background/tiles).
  const pending: NativeGradientGlowSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    drawNativeGradientGlow(spec: Readonly<NativeGradientGlowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeGradientGlow(state, spec);
      pending.length = 0;
    },
  };
}

// Renders `source` into `target` filling its 0..size viewport, via an identity render transform.
function renderSourceIntoTarget(
  state: GlRenderState,
  source: ReturnType<typeof createBitmap>,
  target: GlRenderTarget,
): void {
  beginGlRenderTarget(state, target, _identity);
  state.gl.clearColor(0, 0, 0, 0);
  state.gl.clear(state.gl.COLOR_BUFFER_BIT);
  prepareDisplayObjectRender(state, source);
  renderGlDisplayObject(state, source);
  endGlRenderTarget(state);
}

function compositeNativeGradientGlow(state: GlRenderState, spec: Readonly<NativeGradientGlowSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // Three scratch targets — the gradient glow needs a tint buffer plus a blur ping-pong pair.
  const scratch0 = createGlRenderTarget(state, { width: size, height: size });
  const scratch1 = createGlRenderTarget(state, { width: size, height: size });
  const scratch2 = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl gradient glow: builds the ramp from spec.filter internally, blurs the silhouette,
  // looks the blurred alpha up in the ramp, and composites glow-under-source into destTarget.
  applyGradientGlowFilterToGl(state, sourceTarget, destTarget, [scratch0, scratch1, scratch2], spec.filter);

  // The fullscreen passes leave a scratch framebuffer bound and a tile-sized viewport — they do not
  // restore the screen. This inline flow must rebind the default framebuffer and full-canvas viewport
  // itself before compositing, or the result would draw into a scratch target, not the screen.
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
  destroyGlRenderTarget(state, scratch0);
  destroyGlRenderTarget(state, scratch1);
  destroyGlRenderTarget(state, scratch2);
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

// filter-gradient-glow-parity — proves the Gl NATIVE gradient-glow shader matches the canonical
// surface (CPU) gradient glow.
//
// Companion to filter-blur-parity, for a filter with no CSS form. A gradient glow blurs the source
// silhouette's alpha, looks the blurred alpha up in a color/alpha gradient ramp, then composites the
// glow under the source. The CPU reference is applyGradientGlowFilterToSurface; the Gl native path
// is applyGradientGlowFilterToGl (a tint pass, a box blur, and a ramp-lookup pass into offscreen
// render targets). Canvas/DOM have no native gradient-glow filter, so their native tile is the CPU
// reference itself — parity is trivially exact there and the Gl comparison is the real test.
//
// Two tiles side by side:
//   REFERENCE tile — the source glowed on the CPU via applyGradientGlowFilterToSurface (mask then
//     source-over), blitted as a plain bitmap. Identical bytes on every backend; the oracle's ground truth.
//   NATIVE tile    — Gl: the same source pushed through the real GPU glow shader and composited.
//                    Canvas/DOM: the same CPU-reference bytes (drawNativeGradientGlow is a no-op).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance, plus a not-blank / actually-glowing
// guard so a silently no-op native path fails.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts). It imports createParityTarget from ./render (the local barrel); the functional vite
// harness routes ./render to the active backend's render.<renderer>.ts at runtime.

const TILE = 256;
const SQUARE = 96;
const SQUARE_MIN = (TILE - SQUARE) / 2; // 80
const SQUARE_MAX = SQUARE_MIN + SQUARE; // 176
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Filter config — reused verbatim from the validated filter-gradient-glow example: gradient ramp
// transparent-black (ratio 0) → opaque-magenta (ratio 255), so the soft glow ring outside the square
// edges is magenta.
const GLOW_CONFIG = {
  colors: [0x000000, 0xff00ff],
  alphas: [0, 1],
  ratios: [0, 255],
  blurX: 8,
  blurY: 8,
  strength: 2,
};

// Source: a centered opaque-white square on transparent black (matches the validated example). A hard
// silhouette makes the glow ring unambiguous to sample.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: the canonical surface gradient glow, then the source composited on top — the oracle's
// ground truth and the bytes drawn into the REFERENCE tile (and into Canvas/DOM native tiles).
const maskData = new Uint8ClampedArray(TILE * TILE * 4);
const glowScratch = new Uint8ClampedArray(TILE * TILE * 4);
applyGradientGlowFilterToSurface(
  maskData,
  glowScratch,
  createSurfaceRegion(source),
  createGradientGlowFilter(GLOW_CONFIG),
);

// Composite: result = glow mask, then source-over on top (straight-alpha over) — same as the example.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
const src = source.data;
for (let i = 0; i < referenceData.length; i += 4) {
  const sa = src[i + 3] / 255;
  const ma = maskData[i + 3] / 255;
  const outA = sa + ma * (1 - sa);
  for (let c = 0; c < 3; c++) {
    const sc = src[i + c];
    const mc = maskData[i + c];
    referenceData[i + c] = outA > 0 ? Math.round((sc * sa + mc * ma * (1 - sa)) / outA) : 0;
  }
  referenceData[i + 3] = Math.round(outA * 255);
}
// Flatten alpha to 255 so the reference matches the alpha:false canvas readback.
for (let i = 3; i < referenceData.length; i += 4) referenceData[i] = 255;
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-glowed bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile. Gl composites the GPU glow over this position; Canvas/DOM have no native glow filter,
// so the native tile IS the CPU-reference bitmap (drawn here, drawNativeGradientGlow a no-op). On Gl
// the GPU composite lands at the same position over whatever this draws — but the background is opaque
// black there, so we leave the native slot empty on Gl by drawing the reference only when there is no
// shader path. The composite spec drives the real Gl tile.
if (target.kind !== 'webgl') {
  addNodeChild(root, makeBitmap(referenceData, NATIVE_X, TOP));
}

target.drawNativeGradientGlow?.({
  source: sourceImage,
  filter: createGradientGlowFilter(GLOW_CONFIG),
  x: NATIVE_X,
  y: TOP,
  tile: TILE,
});

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it back
// to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are CALIBRATED for a glow effect: the GPU path uses a box-blur
// approximation of the CPU Gaussian and an 8-bit gradient ramp, so the soft glow band and the ring's
// fade-off diverge from the CPU reference across a sizeable fraction of the tile. This is a blurry/glow
// effect (looser ~0.30), not a per-pixel color-matrix (which would be tight ~0.10). Tighten once real
// captures pin down the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 40;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the square center must still be white (the source composited on top of the glow).
  const center = getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2);
  if (green(center) <= 120) {
    throw new Error(`[filter-gradient-glow-parity:${render()}] native tile blank/dark at center — got #${hex(center)}`);
  }

  // 2) Actually glowing: just outside the square edge the magenta glow ring must be present — magenta
  // means R and B both clearly above G. A no-op native path would leave this background-black.
  const ring = getSurfacePixelRgb(nativeTile, TILE / 2, SQUARE_MAX + 2);
  const r = (ring >> 16) & 255;
  const g = (ring >> 8) & 255;
  const b = ring & 255;
  if (r <= 30 || b <= 30 || r <= g || b <= g) {
    throw new Error(
      `[filter-gradient-glow-parity:${render()}] native glow ring missing/wrong hue at edge — expected magenta, got #${hex(ring)}`,
    );
  }

  // 3) Parity: the native glow matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-gradient-glow-parity:${render()}] native glow diverges from CPU reference — ` +
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
