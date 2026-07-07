import { createDisplacementMapFilter } from '@flighthq/filters';
import { applyDisplacementMapFilterToSurface } from '@flighthq/filters-surface';
import type { DisplayObject, GlRenderState, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyDisplacementMapFilterToGl,
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

import type { NativeDisplacementSpec, ParityTarget } from './parity';

// Gl backend of the displacement-map-parity test.
//
// Native path: the real Gl displacement is a SINGLE-PASS shader (applyDisplacementMapFilterToGl) that
// samples the source (texture unit 0) at a UV offset driven by the displacement map (texture unit 1), into
// an offscreen `dest` render target, then composites that target onto the screen as a positioned quad. This
// mirrors the engine's own render-cache composite flow (packages/displayobject-gl/src/webglCache.ts).
//
// Unlike the blur suite, this filter takes THREE targets (source, map, dest) and NO temp/ping-pong scratch:
//   1. Render the source bitmap into a TILE-sized `source` target (identity render transform → the
//      origin-placed bitmap fills the target's 0..TILE viewport).
//   2. Render the displacement-map bitmap into a TILE-sized `map` target the SAME way.
//   3. applyDisplacementMapFilterToGl(state, source, map, dest, filter) — the single GPU pass.
//   4. bindScreenFramebuffer(state) — the fullscreen pass leaves the dest framebuffer/viewport bound; the
//      screen must be rebound before compositing or the result draws into the dest target.
//   5. Prepare a placement bitmap node at the native tile position to harvest its world×device transform,
//      then drawGlRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result at
//      that position (the composite V-flips, matching how steps 1–2 wrote the targets — same convention the
//      render cache relies on, so the result lands upright).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU warp runs at the same resolution
// the CPU/surface reference warps at; the composite upscales by the device transform exactly as the reference
// bitmap tile does. This keeps the two tiles at matching effective resolution.

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

  // Pending GPU warps, applied after the scene draws (so the composite lands over the background/tiles).
  const pending: NativeDisplacementSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    drawNativeDisplacement(spec: Readonly<NativeDisplacementSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeDisplacement(state, spec);
      pending.length = 0;
    },
  };
}

// Renders `image` (drawn at origin, sized to one logical tile) into `target`, filling its 0..size viewport
// via an identity render transform.
function renderImageIntoTarget(
  state: GlRenderState,
  image: NativeDisplacementSpec['source'],
  target: GlRenderTarget,
): void {
  const bitmap = createBitmap();
  bitmap.data.image = image;
  bitmap.data.smoothing = false;
  bitmap.x = 0;
  bitmap.y = 0;

  beginGlRenderTarget(state, target, _identity);
  state.gl.clearColor(0, 0, 0, 0);
  state.gl.clear(state.gl.COLOR_BUFFER_BIT);
  prepareDisplayObjectRender(state, bitmap);
  renderGlDisplayObject(state, bitmap);
  endGlRenderTarget(state);
}

function compositeNativeDisplacement(state: GlRenderState, spec: Readonly<NativeDisplacementSpec>): void {
  const size = spec.tile;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const mapTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });

  renderImageIntoTarget(state, spec.source, sourceTarget);
  renderImageIntoTarget(state, spec.map, mapTarget);

  // The real Gl displacement: a single fullscreen pass sampling source at a map-driven UV offset.
  // Same filter descriptor the surface reference used, so the warp math matches.
  applyDisplacementMapFilterToGl(state, sourceTarget, mapTarget, destTarget, spec.filter);

  // The fullscreen pass (drawGlFullscreenPass) leaves the dest framebuffer bound and a tile-sized
  // viewport — it does not restore the screen. Rebind the default framebuffer and full-canvas viewport
  // before compositing, or the result would draw into the dest target, not the screen.
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
  destroyGlRenderTarget(state, mapTarget);
  destroyGlRenderTarget(state, destTarget);
}

// Rebinds the default (screen) framebuffer and the full-canvas viewport, and resets the runtime's cached
// framebuffer/viewport so subsequent draws target the screen. Mirrors the state the screen walk runs under
// (framebuffer null, renderTargetViewport null → viewport = canvas).
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

// filter-displacement-map-parity — proves the Gl NATIVE displacement-map shader matches the canonical
// surface (CPU) displacement reference.
//
// DisplacementMapFilter has a CPU reference impl (applyDisplacementMapFilterToSurface) and a single-pass
// Gl shader impl (applyDisplacementMapFilterToGl) — but NO CSS form, so unlike the blur suite there
// is no DOM/Canvas native filter. This test draws two tiles side by side:
//   REFERENCE tile — the source warped on the CPU via applyDisplacementMapFilterToSurface, blitted as a
//     plain bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — on Gl, the same source pushed through the real displacement shader path. On
//     Canvas/DOM there is no native filter, so the NATIVE tile is the surface result drawn as a plain
//     bitmap (parity holds by construction; Gl is the meaningful comparison).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and asserts
// the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader warp ≈ the CPU
// warp. It also asserts the native tile is not blank and was actually displaced (the line moved off its
// original column), so a silently no-op native path fails the test.
//
// Source/map/filter REUSE the validated filter-displacement-map-wrap test: a black tile with one vertical
// white line at x=128, a map whose RED channel is 255 on the left half / 0 on the right half driving X
// displacement (componentX=0, scaleX=24). The line lands at output x=116 in the left region and x=140 in
// the right region; column 128 goes black.

const TILE = 256;
const HALF = TILE / 2;
const REFERENCE_X = 120;
const NATIVE_X = 424;
const LINE_X = 128; // original vertical white line column
const SHIFT = 12; // 0.5 × scaleX (24); RED 255 ⇒ +SHIFT source read, RED 0 ⇒ −SHIFT source read

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Source: black tile with a single vertical white line at x = LINE_X. A hard 1px feature makes the
// displacement unambiguous to sample.
const source = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(source, LINE_X, 0, 1, TILE), 0xffffffff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// Displacement map: RED = 255 in left half, RED = 0 in right half (128 is neutral, so left shifts +, right −).
const map = createSurface(TILE, TILE, 0x000000ff);
fillSurfaceRectangle(createSurfaceRegion(map, 0, 0, HALF, TILE), 0xff0000ff);
fillSurfaceRectangle(createSurfaceRegion(map, HALF, 0, HALF, TILE), 0x000000ff);
const mapImage = createImageResourceFromCanvas(surfaceToCanvas(map.data));

const filter = createDisplacementMapFilter({
  mode: 'wrap',
  componentX: 0,
  componentY: 1,
  scaleX: 24,
  scaleY: 0,
});

// CPU reference: the canonical surface displacement warp. This is the oracle's ground truth and the bytes
// drawn into the REFERENCE tile on every backend.
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
applyDisplacementMapFilterToSurface(referenceData, createSurfaceRegion(source), createSurfaceRegion(map), filter);
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-warped bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — on Canvas/DOM there is no native displacement filter, so the native tile is the same
// CPU-warped bytes drawn as a plain bitmap (parity by construction). On Gl, drawNativeDisplacement runs
// the real GPU shader and composites its result over this tile region instead.
addNodeChild(root, makeBitmap(referenceData, NATIVE_X, TOP));

target.drawNativeDisplacement?.({
  source: sourceImage,
  map: mapImage,
  filter,
  x: NATIVE_X,
  y: TOP,
  tile: TILE,
});

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it back
// to TILE×TILE, and compares it to the CPU reference.
//
// Tolerance calibration: displacement is a hard-edged geometric warp (not a soft blur), so the shader and
// CPU samplers should agree almost everywhere. The only divergence is single-pixel sampling/rounding along
// the displaced line and at the map's left/right boundary (texture filtering vs JS nearest). MISMATCH_FRACTION
// is therefore kept tight at 0.10 (10% of pixels) with a CHANNEL_TOLERANCE of 24. Tighten once real captures
// pin the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.1;
const CHANNEL_TOLERANCE = 24;

const ROW = TILE / 2; // sample mid-height, away from any tile edge

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Actually displaced: the white line moved off its original column (now black) and onto x=116 (left
  // RED-255 region, +SHIFT read) and x=140 (right RED-0 region, −SHIFT read). A no-op native path would
  // leave the line on column 128.
  const original = green(getSurfacePixelRgb(nativeTile, LINE_X, ROW));
  if (original > 120) {
    throw new Error(
      `[filter-displacement-map-parity:${render()}] native line not displaced — original column ${LINE_X} still bright (green ${original})`,
    );
  }
  const leftShifted = green(getSurfacePixelRgb(nativeTile, LINE_X - SHIFT, ROW));
  const rightShifted = green(getSurfacePixelRgb(nativeTile, LINE_X + SHIFT, ROW));
  if (leftShifted <= 120 || rightShifted <= 120) {
    throw new Error(
      `[filter-displacement-map-parity:${render()}] native displaced line missing — ` +
        `green at x=${LINE_X - SHIFT} is ${leftShifted}, at x=${LINE_X + SHIFT} is ${rightShifted} (expected both > 120)`,
    );
  }

  // 2) Parity: the native warp matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-displacement-map-parity:${render()}] native displacement diverges from CPU reference — ` +
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
