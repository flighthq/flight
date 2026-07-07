import { createSharpenFilter } from '@flighthq/filters';
import { applySharpenFilterToSurface } from '@flighthq/filters-surface';
import type { DisplayObject, GlRenderState, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applySharpenFilterToGl,
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
  setSurfacePixel,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

import type { NativeSharpenSpec, ParityTarget } from './parity';

// Gl backend of the sharpen-parity test.
//
// Native path: the real Gl sharpen is an unsharp mask (applySharpenFilterToGl) — a box-blur into
// scratch targets followed by a single full-screen pass that computes source + (source - blurred) *
// amount. It runs over offscreen render targets, then is composited onto the screen as a positioned
// quad. This mirrors the engine's own render-cache flow (packages/displayobject-gl/src/webglCache.ts):
// render content into a target, run the GPU passes, composite via drawGlRenderTargetResult.
//
// applySharpenFilterToGl's signature differs from the blur's: it takes (state, source, dest,
// scratch[], filter) where scratch is an array of TWO render targets — scratch[0] holds the blurred
// image, scratch[1] is the blur's ping-pong temp. There is no separate `temp` positional argument and
// the unsharp step itself is a single pass writing source/blurred into dest.
//
// Flow per drawNativeSharpen():
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applySharpenFilterToGl(state, source, dest, [blurred, blurTemp], {blurX, blurY, amount}).
//   3. bindScreenFramebuffer — the GPU passes leave a render-target framebuffer/viewport bound; the
//      inline flow must restore the screen before compositing (the render cache avoids this because its
//      composite runs during the on-screen walk).
//   4. Prepare a placement bitmap node at the native tile position to harvest its world×device
//      transform, then drawGlRenderTargetResult(state, proxy, dest, identity) to composite the
//      TILE×TILE result at that position (the composite V-flips, matching how step 1 wrote the target).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU sharpen runs at the same
// resolution the CPU/surface reference sharpens at; the composite upscales by the device transform
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

  // Pending GPU sharpens, applied after the scene draws (so the composite lands over the background/tiles).
  const pending: NativeSharpenSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    drawNativeSharpen(spec: Readonly<NativeSharpenSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeSharpen(state, spec);
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

function compositeNativeSharpen(state: GlRenderState, spec: Readonly<NativeSharpenSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // applySharpenFilterToGl needs TWO scratch targets: scratch[0] = blurred, scratch[1] = blur temp.
  const blurredTarget = createGlRenderTarget(state, { width: size, height: size });
  const blurTempTarget = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl sharpen: unsharp mask (box-blur the source into scratch[0] via scratch[1], then
  // dest = source + (source - blurred) * amount). Matches the surface sharpen's blurX/blurY/amount.
  applySharpenFilterToGl(state, sourceTarget, destTarget, [blurredTarget, blurTempTarget], {
    blurX: spec.blurX,
    blurY: spec.blurY,
    amount: spec.amount,
  });

  // The filter passes (drawGlFullscreenPass) leave a render-target framebuffer bound and a tile-sized
  // viewport — they do not restore the screen. Rebind the default framebuffer and full-canvas viewport
  // before compositing, or the result would draw into a filter target, not the screen.
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
  destroyGlRenderTarget(state, blurredTarget);
  destroyGlRenderTarget(state, blurTempTarget);
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

// filter-sharpen-parity — proves each backend's NATIVE sharpen filter matches the canonical surface
// (CPU) sharpen.
//
// Sibling of filter-blur-parity, same two-tile layout and oracle shape. A filter has a CPU reference
// impl (apply*FilterToSurface) and native per-backend impls. Sharpen (unsharp mask) has no CSS form, so
// only Gl has a real native path here; on Canvas/DOM the "native" tile is the surface result itself
// (parity by construction). This test draws two tiles side by side:
//   REFERENCE tile — the source sharpened on the CPU via applySharpenFilterToSurface, blitted as a plain
//     bitmap. Identical bytes on every backend; it is the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path: the unsharp-mask
//     shader on Gl; the CPU reference bytes on Canvas/DOM (no native sharpen path exists there).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// sharpen ≈ the CPU sharpen. It also asserts the native tile is not blank and is actually sharpened
// (the seam overshoots), so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts). When a backend provides drawNativeSharpen (Gl) app.ts runs the GPU pass over the
// SOURCE image; otherwise (Canvas/DOM) it blits the CPU reference bytes as the native tile. It imports
// createParityTarget from ./render (the local barrel); the functional vite harness routes ./render to
// the active backend's render.<renderer>.ts at runtime.

const TILE = 256;
const HALF = TILE / 2;
const REFERENCE_X = 120;
const NATIVE_X = 424;

// Sharpen params reused from the validated filter-sharpen test.
const DARK = 0x80; // flat left value
const LIGHT = 0xb0; // flat right value
const RAMP = 8; // ramp width in pixels, centred on the seam
const RAMP_X0 = HALF - RAMP / 2; // first ramp column
const BLUR = 4;
const AMOUNT = 1;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

function grayColor(level: number): number {
  return ((level & 0xff) * 0x01010100) | 0xff; // packed RGBA, opaque gray
}

// Source: a vertical soft step — dark left half, light right half, joined by an 8px linear ramp across
// the seam. Sharpen (unsharp mask) overshoots near the seam (dark side dips, light side rises) while the
// flat interiors stay ~unchanged. Identical construction to filter-sharpen's source.
const source = createSurface(TILE, TILE, grayColor(DARK));
fillSurfaceRectangle(createSurfaceRegion(source, HALF, 0, HALF, TILE), grayColor(LIGHT));
for (let i = 0; i < RAMP; i += 1) {
  const x = RAMP_X0 + i;
  const t = (i + 1) / (RAMP + 1);
  const level = Math.round(DARK + (LIGHT - DARK) * t);
  for (let y = 0; y < TILE; y += 1) setSurfacePixel(source, x, y, grayColor(level));
}
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: the canonical surface sharpen. This is the oracle's ground truth and the bytes drawn
// into the REFERENCE tile on every backend (and into the NATIVE tile on Canvas/DOM).
const referenceData = new Uint8ClampedArray(TILE * TILE * 4);
const blurScratch = new Uint8ClampedArray(TILE * TILE * 4);
applySharpenFilterToSurface(
  referenceData,
  blurScratch,
  createSurfaceRegion(source),
  createSharpenFilter({ blurX: BLUR, blurY: BLUR, amount: AMOUNT }),
);
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-sharpened bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

if (target.drawNativeSharpen) {
  // Shader backend (Gl): the native tile is the SOURCE bitmap, sharpened by the GPU pass and
  // composited at NATIVE_X. The placement bitmap stays out of the scene tree (the composite draws it).
  target.drawNativeSharpen({
    source: sourceImage,
    blurX: BLUR,
    blurY: BLUR,
    amount: AMOUNT,
    x: NATIVE_X,
    y: TOP,
    tile: TILE,
  });
} else {
  // No native sharpen on Canvas/DOM — there is no CSS sharpen primitive. The native tile is the CPU
  // reference bytes, so parity holds by construction; the Gl leg carries the meaningful comparison.
  addNodeChild(root, makeBitmap(referenceData, NATIVE_X, TOP));
}

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it
// back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated for an unsharp mask (a localized edge effect, not a
// broad blur): the shader and CPU kernels agree across the flat interiors and disagree only in the
// narrow overshoot band around the seam, a small minority of the tile. So this tolerance is TIGHTER than
// blur-parity's. On Canvas/DOM the native tile IS the reference bytes, so the mismatch there is ~0.
const MISMATCH_FRACTION = 0.1;
const CHANNEL_TOLERANCE = 16;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the flat light interior must carry the source value, not the background.
  const flatLight = channel(getSurfacePixelRgb(nativeTile, TILE - 32, HALF));
  if (flatLight < LIGHT - 16) {
    throw new Error(
      `[filter-sharpen-parity:${render()}] native tile blank/dark — flat-light interior ${flatLight} (expected ~${LIGHT})`,
    );
  }

  // 2) Actually sharpened: the seam overshoots. Just left of the ramp the dark side dips below DARK; just
  // right of the ramp the light side rises above LIGHT. A no-op native path would leave both unchanged.
  const darkEdge = channel(getSurfacePixelRgb(nativeTile, RAMP_X0 - 2, HALF));
  const lightEdge = channel(getSurfacePixelRgb(nativeTile, HALF + RAMP / 2 + 2, HALF));
  if (darkEdge >= DARK) {
    throw new Error(
      `[filter-sharpen-parity:${render()}] dark side did not undershoot — got ${darkEdge} (expected < ${DARK})`,
    );
  }
  if (lightEdge <= LIGHT) {
    throw new Error(
      `[filter-sharpen-parity:${render()}] light side did not overshoot — got ${lightEdge} (expected > ${LIGHT})`,
    );
  }

  // 3) Parity: the native sharpen matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-sharpen-parity:${render()}] native sharpen diverges from CPU reference — ` +
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

function channel(rgb: number): number {
  return rgb & 0xff; // gray: all channels equal, read blue
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
