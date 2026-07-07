import { createDropShadowFilter } from '@flighthq/filters';
import { computeDropShadowFilterCss } from '@flighthq/filters-css';
import { getShadowFilterOffset } from '@flighthq/filters-math';
import { applyDropShadowFilterToSurface } from '@flighthq/filters-surface';
import type { Bitmap, DisplayObject, GlRenderState, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyDropShadowFilterToGl,
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

import type { NativeDropShadowSpec, ParityTarget } from './parity';

// Gl backend of the drop-shadow-parity test.
//
// Native path: the real Gl drop shadow is a tint + box-blur + offset-composite shader sequence run
// over offscreen render targets (applyDropShadowFilterToGl), then composited onto the screen as a
// positioned quad. This mirrors the engine's own render-cache flow
// (packages/displayobject-gl/src/webglCache.ts): render content into a target, run the GPU passes,
// composite the result via drawGlRenderTargetResult.
//
// Unlike the separable blur (source → temp → dest), drop shadow takes a `scratch[]` ARRAY of three
// same-sized targets (tint mask, blurred shadow, blur ping-pong temp) and writes the FULL composite —
// the offset shadow AND the original source on top — into `dest`. There is no gradient ramp or
// displacement-map texture; the only extra GPU resources are the three scratch targets.
//
// Flow per drawNativeDropShadow():
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applyDropShadowFilterToGl(state, source, dest, [mask, blurred, blurTemp], filter) — the
//      shader drop shadow. `dest` ends up holding shadow + source composited.
//   3. Rebind the screen framebuffer/viewport (the passes leave a target bound), then prepare a
//      placement bitmap node at the native tile position to harvest its world×device transform and
//      drawGlRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result
//      upright at that position (the composite V-flips, matching how step 1 wrote the target).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU shadow runs at the same
// resolution the CPU/surface reference runs at; the composite upscales by the device transform exactly
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

  // Pending GPU shadows, applied after the scene draws (so the composite lands over the background/tiles).
  const pending: NativeDropShadowSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on Gl — the drop shadow is the GPU shader passes below.
    applyNativeDropShadow(_node: Bitmap, _css: string): void {},
    drawNativeDropShadow(spec: Readonly<NativeDropShadowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeDropShadow(state, spec);
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

function compositeNativeDropShadow(state: GlRenderState, spec: Readonly<NativeDropShadowSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // Drop shadow needs THREE scratch targets: tint mask, blurred shadow, and the blur's ping-pong temp.
  const maskTarget = createGlRenderTarget(state, { width: size, height: size });
  const blurredTarget = createGlRenderTarget(state, { width: size, height: size });
  const blurTempTarget = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl drop shadow: tint the source, box-blur it, blit it at the angle/distance offset, then
  // blit the source on top — the full composite lands in destTarget. The filter kind field is dropped to
  // match the Omit<DropShadowFilter, 'kind'> parameter shape.
  const { kind: _kind, ...filterParams } = spec.filter; // eslint-disable-line
  applyDropShadowFilterToGl(state, sourceTarget, destTarget, [maskTarget, blurredTarget, blurTempTarget], filterParams);

  // The shadow passes leave a target's framebuffer bound and a tile-sized viewport — they do not restore
  // the screen. The render cache avoids this because its composite runs during the on-screen walk; this
  // inline flow must rebind the default framebuffer and full-canvas viewport itself before compositing,
  // or the result would draw into the shadow target, not the screen.
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
  destroyGlRenderTarget(state, maskTarget);
  destroyGlRenderTarget(state, blurredTarget);
  destroyGlRenderTarget(state, blurTempTarget);
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

// filter-drop-shadow-parity — proves each backend's NATIVE drop-shadow filter matches the canonical
// surface (CPU) drop shadow.
//
// A filter has a CPU reference impl (apply*FilterToSurface) and native per-backend impls (a CSS
// `drop-shadow(...)` string for DOM/Canvas, a tint/blur/offset shader sequence for Gl). This test
// draws two tiles side by side:
//   REFERENCE tile — the source drop-shadowed on the CPU via applyDropShadowFilterToSurface, composited
//     (tinted blurred mask under the original source) and flattened over the black background, blitted as
//     a plain bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path (CSS drop-shadow on
//     DOM/Canvas, the GPU drop-shadow passes on Gl).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and asserts
// the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader shadow ≈ the
// CPU shadow, and on Canvas it proves the CSS shadow ≈ the CPU shadow. It also asserts the native tile is
// not blank and carries the red shadow band, so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts) and app.ts calls applyNativeDropShadow (CSS backends) and drawNativeDropShadow (shader
// backends) unconditionally — the inactive one is a no-op on each backend. It imports createParityTarget
// from ./render (the local barrel); the functional vite harness routes ./render to the active backend's
// render.<renderer>.ts at runtime.

const TILE = 256;
const SQUARE = 96;
const SQUARE_MIN = (TILE - SQUARE) / 2; // 80
const SQUARE_MAX = SQUARE_MIN + SQUARE; // 176
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0x000000ff; // opaque black; the tiles' transparent regions reveal it.

// Red shadow, offset 14px at 45° (down-right), symmetric blur 4. distance/angle map to a pixel offset
// via getShadowFilterOffset; the surface filter itself produces the blurred tinted mask in place.
// blurX === blurY is required for the CSS path (computeDropShadowFilterCss returns null otherwise).
const filter = createDropShadowFilter({
  distance: 14,
  angle: 45,
  color: 0xff0000,
  blurX: 4,
  blurY: 4,
  strength: 1,
});
const { dx, dy } = getShadowFilterOffset(filter, { dx: 0, dy: 0 });

// Source: a centered opaque-white square on a fully transparent tile. The square's alpha is what the
// shadow mask is shaped from.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, SQUARE_MIN, SQUARE_MIN, SQUARE, SQUARE), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: the canonical surface drop shadow, composited over the opaque BACKGROUND. The filter
// writes only the blurred tinted mask in place; the effect is completed by compositing that mask under
// the original source at the shadow offset. Building that chain on a BACKGROUND-filled base flattens in
// the same step (source-over is associative), so the result is fully opaque and matches what the frame
// shows (getSurfaceMismatch compares alpha). The shadow's (dx, dy) offset is expressed by compositing
// the mask into a region whose origin is (dx, dy); the source is then composited on top.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyDropShadowFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

const referenceSurface = createSurface(TILE, TILE, BACKGROUND);
const referenceData = referenceSurface.data;
const referenceRegion = createSurfaceRegion(referenceSurface);
compositeSurfacePixels(createSurfaceRegion(referenceSurface, dx, dy, TILE, TILE), mask);
compositeSurfaceRegion(referenceRegion, createSurfaceRegion(source));

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-shadowed bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — the source bitmap, shadowed the native way for this backend.
//   CSS backends: bind a drop-shadow() filter to this node; the normal render rasterizes it.
//   Shader backends: applyNativeDropShadow is a no-op; drawNativeDropShadow runs the GPU passes.
const nativeBitmap = createBitmap();
nativeBitmap.data.image = sourceImage;
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

const css = computeDropShadowFilterCss(filter);
if (css !== null) target.applyNativeDropShadow(nativeBitmap, css);
target.drawNativeDropShadow?.({ source: sourceImage, filter, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it back
// to TILE×TILE, and compares it to the CPU reference. Drop shadow is a blurry effect (box blur on Gl,
// Gaussian drop-shadow on CSS, box blur on CPU), so the kernels disagree most in the soft shadow band; the
// tolerance is generous and calibrated, not exact — looser than a color-matrix (~0.10) parity test.
//
// CALIBRATED for a 4px symmetric blur + 14px offset red shadow: CSS uses a Gaussian drop-shadow while the
// CPU/Gl paths use a box blur, so the shadow band's soft edge differs across a minority of the tile.
// 0.30 fraction with a 28-channel tolerance covers that divergence; tighten once real captures pin the
// actual delta, loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 28;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank / actually filtered: just past the square's down-right corner the shadow band must be
  //    red. A no-op native path (no shadow drawn) leaves this region black background.
  const shadow = getSurfacePixelRgb(nativeTile, SQUARE_MAX + 6, SQUARE_MAX + 6);
  const sr = (shadow >> 16) & 255;
  const sg = (shadow >> 8) & 255;
  const sb = shadow & 255;
  if (sr <= 90 || sg > 110 || sb > 110) {
    throw new Error(
      `[filter-drop-shadow-parity:${render()}] native shadow band not red down-right of square — got #${hex(shadow)}`,
    );
  }

  // 2) Square preserved: the source white square's centre is still bright (the source is drawn on top of
  //    its own shadow). A path that drew only the shadow (or nothing) fails here.
  const centre = getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2);
  if (((centre >> 8) & 255) <= 150) {
    throw new Error(`[filter-drop-shadow-parity:${render()}] native square centre not bright — got #${hex(centre)}`);
  }

  // 3) Parity: the native drop shadow matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-drop-shadow-parity:${render()}] native drop shadow diverges from CPU reference — ` +
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
