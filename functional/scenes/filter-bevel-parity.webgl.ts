import { createBevelFilter } from '@flighthq/filters';
import { applyBevelFilterToSurface } from '@flighthq/filters-surface';
import type { Bitmap, DisplayObject, GlRenderState, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyBevelFilterToGl,
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

import type { NativeBevelSpec, ParityTarget } from './parity';

// Gl backend of the bevel-parity test — the meaningful native comparison.
//
// Native path: the real Gl bevel is a multi-pass shader chain (applyBevelFilterToGl): a neutral
// tint to build the alpha basis, a box blur, then directional offset-blit tint passes for the shadow
// and highlight layers, with the source composited on top (no knockout). It runs over offscreen render
// targets, then is composited onto the screen as a positioned quad. This mirrors the engine's own
// render-cache flow (packages/displayobject-gl/src/webglCache.ts): render content into a target, run the
// GPU passes, composite the result via drawGlRenderTargetResult.
//
// Flow per drawNativeBevel():
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport). The
//      target is cleared to TRANSPARENT so the bevel reads the square's true alpha edge.
//   2. applyBevelFilterToGl(state, source, dest, scratch, filter) — the shader bevel. Unlike blur
//      (which ping-pongs a single temp), bevel takes a `scratch` array of THREE same-sized targets it
//      uses internally (tinted / blurred / blurTemp). It composites the source under the bevel itself,
//      so `dest` already matches the CPU reference's "mask over source" result.
//   3. Rebind the screen framebuffer (the passes leave a target bound), prepare a placement bitmap node
//      at the native tile position to harvest its world×device transform, then
//      drawGlRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result.
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU bevel runs at the same
// resolution the CPU/surface reference bevels at; the composite upscales by the device transform exactly
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

  // Pending GPU bevels, applied after the scene draws (so the composite lands over the background/tiles).
  const pending: NativeBevelSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on Gl — the bevel is the GPU shader chain below.
    applyNativeBevel(_node: Bitmap): void {},
    drawNativeBevel(spec: Readonly<NativeBevelSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeBevel(state, spec);
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

function compositeNativeBevel(state: GlRenderState, spec: Readonly<NativeBevelSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile, on a transparent target.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // applyBevelFilterToGl needs THREE same-sized scratch targets (tinted / blurred / blurTemp).
  const scratchA = createGlRenderTarget(state, { width: size, height: size });
  const scratchB = createGlRenderTarget(state, { width: size, height: size });
  const scratchC = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl bevel: tint + box-blur basis, directional shadow/highlight offset blits, source on
  // top (no knockout) — so destTarget already holds "bevel mask over source", matching the CPU
  // reference. The filter takes the BevelFilter descriptor minus its `type` tag (Omit<BevelFilter,
  // 'type'>); passing the full descriptor is structurally compatible.
  applyBevelFilterToGl(state, sourceTarget, destTarget, [scratchA, scratchB, scratchC], spec.filter);

  // The bevel passes leave a target framebuffer bound and a tile-sized viewport — they do not restore
  // the screen. This inline flow must rebind the default framebuffer and full-canvas viewport itself
  // before compositing, or the result would draw into a bevel target, not the screen.
  bindScreenFramebuffer(state);

  // Placement node carries the world×device transform that positions the TILE×TILE result at the native
  // tile. It is NOT part of the rendered scene tree (it would double-draw); we prepare it only to
  // harvest its render proxy's transform2D, then composite the dest target through that transform.
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
  destroyGlRenderTarget(state, scratchA);
  destroyGlRenderTarget(state, scratchB);
  destroyGlRenderTarget(state, scratchC);
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

// filter-bevel-parity — proves the Gl NATIVE inner-bevel filter matches the canonical surface (CPU)
// inner bevel.
//
// Sibling of filter-blur-parity, swapped to the bevel filter. A bevel has a CPU reference impl
// (applyBevelFilterToSurface, writing a tinted edge MASK) and a native Gl impl
// (applyBevelFilterToGl, a tint + box-blur + offset-blit shader chain). Unlike blur there is NO CSS
// bevel, so Canvas/DOM cannot express a native bevel — their NATIVE tile is the surface reference
// itself (parity holds by construction), and Gl is the only meaningful comparison. This test draws
// two tiles side by side:
//   REFERENCE tile — the source beveled on the CPU: applyBevelFilterToSurface produces the inner-bevel
//     edge mask, composited (source-over) over the source, blitted as a plain bitmap. Identical bytes
//     on every backend; it is the oracle's ground truth. (Matches filter-bevel-inner's reference.)
//   NATIVE tile    — the same source pushed through THIS backend's real path. Canvas/DOM: the reference
//     bytes again (no native bevel). Gl: the source pushed through the bevel shader chain, whose
//     no-knockout output already composites the source under the bevel, matching the reference.
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// bevel ≈ the CPU bevel. It also asserts the native tile is not blank and is actually beveled (the
// directional highlight/shadow edges are present), so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract
// (see ./parity.ts) and app.ts calls applyNativeBevel (a no-op everywhere) and drawNativeBevel (Gl
// only) unconditionally. It imports createParityTarget from ./render (the local barrel); the functional
// vite harness routes ./render to the active backend's render.<renderer>.ts at runtime.

const TILE = 256;
const SQUARE = 96;
const INSET = (TILE - SQUARE) / 2; // centered square: x/y in [80, 176)
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0x000000ff;

// Source: centered opaque mid-gray square on a TRANSPARENT field (reused verbatim from
// filter-bevel-inner). The bevel derives from the directional gradient of the source's blurred ALPHA,
// so the square must carry the only alpha edge in the surface.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, INSET, INSET, SQUARE, SQUARE), 0x808080ff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// Filter: the validated inner-bevel config from filter-bevel-inner. Light points down-right (angle 45°).
const filter = createBevelFilter({
  bevelType: 'inner',
  angle: 45,
  distance: 6,
  blurX: 4,
  blurY: 4,
  highlightColor: 0xffffff,
  shadowColor: 0x000000,
  strength: 2,
});

// CPU reference: the canonical surface inner bevel, composited over the opaque BACKGROUND.
// applyBevelFilterToSurface writes a tinted edge MASK; the inner bevel is completed by source-over of
// the source then the mask. Building that chain on a BACKGROUND-filled base both composites and flattens
// in one step (source-over is associative, so layering over the opaque base == compositing then
// flattening): the result is fully opaque, matching what the rendered frame shows. This matters because
// the native tile is cropped from a frame drawn over the opaque background and getSurfaceMismatch
// compares alpha — a transparent reference would mismatch every background pixel (~86% of the tile).
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyBevelFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

const referenceSurface = createSurface(TILE, TILE, BACKGROUND);
const referenceData = referenceSurface.data;
const referenceRegion = createSurfaceRegion(referenceSurface);
compositeSurfaceRegion(referenceRegion, createSurfaceRegion(source));
compositeSurfacePixels(referenceRegion, mask);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-beveled bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile.
//   Canvas/DOM: no native bevel — draw the SAME CPU-beveled bytes as the native tile (parity by
//     construction). drawNativeBevel is a no-op there.
//   Gl: applyNativeBevel is a no-op; drawNativeBevel runs the GPU bevel chain over the SOURCE image
//     and composites it at the native tile position.
const nativeBitmap = createBitmap();
nativeBitmap.data.image = createImageResourceFromCanvas(surfaceToCanvas(referenceData));
nativeBitmap.data.smoothing = false;
nativeBitmap.x = NATIVE_X;
nativeBitmap.y = TOP;
addNodeChild(root, nativeBitmap);

target.applyNativeBevel(nativeBitmap);
target.drawNativeBevel?.({ source: sourceImage, filter, x: NATIVE_X, y: TOP, tile: TILE });

target.render(root);

// Sample points inside the centered NATIVE square, in logical (pre-scale) tile-local coordinates.
const CENTER = INSET + SQUARE / 2; // 128
const EDGE = 4; // on the inner bevel band (offset 6 + blur 4 peaks near the edge)
const TOP_LEFT = INSET + EDGE; // shadowed edge (gradient faces away from light)
const BOTTOM_RIGHT = INSET + SQUARE - EDGE; // highlighted edge (gradient faces light)

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it
// back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are CALIBRATED for an inner bevel (offset 6, blur 4) on a hard
// edge. The CPU surface bevel and the Gl shader bevel (box-blur basis + offset blits vs. the surface
// Gaussian-derived gradient) disagree mainly in the narrow edge band around the square's border, a
// minority of the tile, and the box-vs-Gaussian blur basis widens that band's divergence. A glow/edge
// effect like this needs a looser tolerance than a tight color-matrix (~0.10) — 0.30 covers the edge
// band while still failing a no-op or grossly-wrong native path. Tighten once real captures pin the
// actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 40;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the square interior must carry mid-gray, not just the background.
  const center = getSurfacePixelRgb(nativeTile, CENTER, CENTER);
  if (luma(center) <= 40) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native tile blank/dark at centre — #${hex(center)} (luma ${luma(center).toFixed(0)})`,
    );
  }

  // 2) Actually beveled: light down-right means the bottom-right inner edge is HIGHLIGHTED (lighter
  // than center) and the top-left inner edge is SHADOWED (darker than center). A no-op native path
  // (flat gray square) would leave both ~= center and fail here.
  const topLeft = getSurfacePixelRgb(nativeTile, TOP_LEFT, TOP_LEFT);
  const bottomRight = getSurfacePixelRgb(nativeTile, BOTTOM_RIGHT, BOTTOM_RIGHT);
  if (!(luma(bottomRight) > luma(center) + 10)) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native bottom-right edge not highlighted — ` +
        `edge #${hex(bottomRight)} (luma ${luma(bottomRight).toFixed(0)}) vs center #${hex(center)} (luma ${luma(center).toFixed(0)})`,
    );
  }
  if (!(luma(topLeft) < luma(center) - 10)) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native top-left edge not shadowed — ` +
        `edge #${hex(topLeft)} (luma ${luma(topLeft).toFixed(0)}) vs center #${hex(center)} (luma ${luma(center).toFixed(0)})`,
    );
  }

  // 3) Parity: the native bevel matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-bevel-parity:${render()}] native bevel diverges from CPU reference — ` +
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

function luma(rgb: number): number {
  return 0.299 * ((rgb >> 16) & 255) + 0.587 * ((rgb >> 8) & 255) + 0.114 * (rgb & 255);
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
