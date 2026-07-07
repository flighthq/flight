import { createGradientBevelFilter } from '@flighthq/filters';
import { applyGradientBevelFilterToSurface } from '@flighthq/filters-surface';
import type { Bitmap, DisplayObject, GlRenderState, GlRenderTarget, Surface } from '@flighthq/sdk';
import {
  BitmapKind,
  addNodeChild,
  applyGradientBevelFilterToGl,
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

import type { NativeGradientBevelSpec, ParityTarget } from './parity';

// Gl backend of the gradient-bevel-parity test.
//
// Native path: the real Gl gradient bevel is a multi-pass shader (applyGradientBevelFilterToGl) —
// a tint/box-blur basis, a bevel-encode pass that samples the blurred alpha at ±offset, and an apply
// pass that looks the encoded bevel value up in a GPU gradient-ramp texture and clips to source alpha.
// The applier builds that ramp texture INTERNALLY from filter.colors/alphas/ratios (via
// createGlGradientRampTexture), so this test does not pre-create the ramp — passing the ramp arrays
// through the filter descriptor is the complete, correct wiring. We run the passes over offscreen
// render targets, then composite the result onto the screen as a positioned quad, mirroring the
// engine's own render-cache flow (packages/displayobject-gl/src/webglCache.ts).
//
// Signature differs from the blur applier:
//   applyGradientBevelFilterToGl(state, source, dest, scratch[3], filter)
// `scratch` is an ARRAY of three same-size targets (the filter ping-pongs through them), not a single
// `temp`. There is no separate CSS path. The applier allocates one temporary WebGLTexture per call and
// deletes it internally; the three scratch targets + source + dest are owned and destroyed here.
//
// Flow per drawNativeGradientBevel():
//   1. Render the source bitmap into a TILE-sized `source` target (identity render transform → the
//      origin-placed bitmap fills the target's 0..TILE viewport). The source must carry its alpha edges
//      (a transparent field with an opaque square), since the bevel reads the alpha channel.
//   2. applyGradientBevelFilterToGl(state, source, dest, [s0, s1, s2], filter) — the shader bevel.
//   3. Rebind the screen framebuffer + full-canvas viewport (the fullscreen passes leave a target bound),
//      then drawGlRenderTargetResult at the native tile position via a placement node's transform
//      (the composite V-flips, matching how step 1 wrote the target — same convention the render cache
//      relies on, so the result lands upright).
//
// Targets are sized in LOGICAL pixels (TILE), so the GPU bevel runs at the same resolution the
// CPU/surface reference filters at; the composite upscales by the device transform exactly as the
// reference bitmap tile does, keeping the two tiles at matching effective resolution.

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
  const pending: NativeGradientBevelSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    drawNativeGradientBevel(spec: Readonly<NativeGradientBevelSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeGradientBevel(state, spec);
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

function compositeNativeGradientBevel(state: GlRenderState, spec: Readonly<NativeGradientBevelSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile. Its transparent field + opaque
  // square give the bevel the alpha edges it reads.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // The applier ping-pongs through THREE scratch targets (not a single temp like blur).
  const scratch0 = createGlRenderTarget(state, { width: size, height: size });
  const scratch1 = createGlRenderTarget(state, { width: size, height: size });
  const scratch2 = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl gradient bevel. The applier builds the gradient ramp texture internally from
  // filter.colors/alphas/ratios, so the ramp arrays travel inside the filter descriptor — there is no
  // separate ramp argument to pass.
  applyGradientBevelFilterToGl(state, sourceTarget, destTarget, [scratch0, scratch1, scratch2], spec.filter);

  // The fullscreen passes leave a render-target framebuffer bound and a tile-sized viewport — they do
  // not restore the screen. Rebind the default framebuffer + full-canvas viewport before compositing,
  // or the result would draw into a bevel target, not the screen.
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
  destroyGlRenderTarget(state, scratch0);
  destroyGlRenderTarget(state, scratch1);
  destroyGlRenderTarget(state, scratch2);
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

// filter-gradient-bevel-parity — proves each backend's NATIVE gradient-bevel filter matches the
// canonical surface (CPU) gradient bevel.
//
// A filter has a CPU reference impl (applyGradientBevelFilterToSurface) and native per-backend impls.
// Unlike blur there is NO CSS gradient-bevel, so only Gl has a meaningful native shader path; on
// Canvas/DOM the "native" tile is the same composited surface bitmap as the reference tile and parity
// holds by construction. This test draws two tiles side by side:
//   REFERENCE tile — the source bevelled on the CPU via applyGradientBevelFilterToSurface, the mask
//     composited over the source, blitted as a plain bitmap. Identical bytes on every backend; it is
//     the oracle's ground truth.
//   NATIVE tile    — the same source pushed through THIS backend's real filter path. On Gl: the
//     source bitmap drawn at the tile, with the gradient-bevel SHADER mask composited over it. On
//     Canvas/DOM: the composited reference bitmap (no native CSS bevel exists).
// The oracle compares the NATIVE tile region against the CPU reference with getSurfaceMismatch and
// asserts the mismatch fraction is below a calibrated tolerance — so on Gl it proves the shader
// bevel ≈ the CPU bevel. It also asserts the native tile is not blank and carries the tinted bevel
// edges, so a silently no-op native path fails the test.
//
// app.ts is backend-agnostic: each render.<backend>.ts implements the ParityTarget contract (see
// ./parity.ts) and app.ts calls drawNativeGradientBevel unconditionally — it is a no-op on Canvas/DOM.
// It imports createParityTarget from ./render (the local barrel); the functional vite harness routes
// ./render to the active backend's render.<renderer>.ts at runtime.

const TILE = 256;
const SQUARE = 96;
const INSET = (TILE - SQUARE) / 2; // centered square: x/y in [80, 176)
const SQUARE_MIN = INSET;
const SQUARE_MAX = INSET + SQUARE;
const REFERENCE_X = 120;
const NATIVE_X = 424;

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0xff000000;

// Inner gradient bevel: a red → gray → blue ramp, light down-right (45°). Reused verbatim from the
// validated filter-gradient-bevel test so the surface reference math is identical.
const filter = createGradientBevelFilter({
  bevelType: 'inner',
  colors: [0xff0000, 0x808080, 0x0000ff],
  alphas: [1, 1, 1],
  ratios: [0, 128, 255],
  angle: 45,
  distance: 8,
  blurX: 4,
  blurY: 4,
  strength: 2,
});

// Source: centered opaque mid-gray square on a TRANSPARENT field. The gradient bevel reads the source
// ALPHA channel to find edges, so the square must be the only opaque content. Reused from the
// validated test.
const source = createSurface(TILE, TILE, 0x00000000);
fillSurfaceRectangle(createSurfaceRegion(source, INSET, INSET, SQUARE, SQUARE), 0x808080ff);
const sourceImage = createImageResourceFromCanvas(surfaceToCanvas(source.data));

// CPU reference: applyGradientBevelFilterToSurface writes a tinted edge MASK; composite it source-over
// onto a copy of the source to complete the effect. This is the oracle's ground truth and the bytes
// drawn into the REFERENCE tile on every backend.
const mask = new Uint8ClampedArray(TILE * TILE * 4);
const blurBuffer = new Uint8ClampedArray(TILE * TILE * 4);
applyGradientBevelFilterToSurface(mask, blurBuffer, createSurfaceRegion(source), filter);

const referenceData = new Uint8ClampedArray(source.data);
for (let i = 0; i < referenceData.length; i += 4) {
  const ma = mask[i + 3] / 255;
  if (ma === 0) continue;
  const inv = 1 - ma;
  referenceData[i] = mask[i] * ma + referenceData[i] * inv;
  referenceData[i + 1] = mask[i + 1] * ma + referenceData[i + 1] * inv;
  referenceData[i + 2] = mask[i + 2] * ma + referenceData[i + 2] * inv;
  referenceData[i + 3] = mask[i + 3] + referenceData[i + 3] * inv;
}
// Flatten alpha to 255 so the reference matches the alpha:false canvas readback. The canvas composites
// transparent pixels over the opaque background, producing A=255; without this getSurfaceMismatch counts
// every transparent pixel as mismatched.
for (let i = 3; i < referenceData.length; i += 4) referenceData[i] = 255;
const referenceSurface = createSurface(TILE, TILE);
referenceSurface.data.set(referenceData);

const target = await createParityTarget(WIDTH, HEIGHT, BACKGROUND);
const TOP = (HEIGHT - TILE) / 2;
const root = createDisplayContainer();

// REFERENCE tile — the CPU-bevelled bytes blitted as a plain bitmap (identical on every backend).
addNodeChild(root, makeBitmap(referenceData, REFERENCE_X, TOP));

// NATIVE tile — the source bitmap at the native position.
//   Canvas/DOM: this IS the composited reference (no native CSS bevel); we blit the reference bytes so
//     the native tile equals the reference by construction.
//   Gl: we blit the raw SOURCE bytes here; drawNativeGradientBevel composites the shader bevel mask
//     over it, reproducing the same source + mask composite the reference does.
const nativeIsShader = target.kind === 'webgl';
addNodeChild(root, makeBitmap(nativeIsShader ? source.data : referenceData, NATIVE_X, TOP));

target.drawNativeGradientBevel?.({
  source: sourceImage,
  filter,
  x: NATIVE_X,
  y: TOP,
  tile: TILE,
});

target.render(root);

// Oracle (runs for canvas/webgl; DOM returns before the canvas oracle, so DOM parity is best-effort via
// the harness not-blank check only). Crops the NATIVE tile out of the device-scaled frame, scales it
// back to TILE×TILE, and compares it to the CPU reference.
//
// MISMATCH_FRACTION/CHANNEL_TOLERANCE are calibrated for a soft inner gradient bevel: the tinted edge is
// a thin soft band along the inner square edges, and the shader (box-blur basis + linear ramp lookup)
// disagrees with the CPU (gaussian-ish) bevel mainly in that band's anti-aliasing and exact tint
// position — a minority of the tile, but blurry/soft, so the tolerance is generous like the blur test.
// Tighten once real captures pin down the actual divergence; loosen only with a noted reason.
const MISMATCH_FRACTION = 0.3;
const CHANNEL_TOLERANCE = 48;

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / WIDTH; // device-pixel scale (canvas backing store is width × devicePixelRatio)

  // Crop the native tile region (device pixels) and downscale to TILE×TILE so it lines up 1:1 with the
  // CPU reference surface for getSurfaceMismatch (which requires equal dimensions).
  const nativeTile = cropFrameTile(frame, NATIVE_X * s, TOP * s, TILE * s, TILE * s, TILE);

  // 1) Not blank: the centre of the square must carry the opaque gray fill, not just the background.
  const centreGreen = green(getSurfacePixelRgb(nativeTile, TILE / 2, TILE / 2));
  if (centreGreen <= 40) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] native tile blank/dark at centre — got green ${centreGreen}`,
    );
  }

  // 2) Actually bevelled: scan the inner top-left edge for a strongly RED pixel (ramp start 0xff0000)
  //    and the inner bottom-right edge for a strongly BLUE pixel (ramp end 0x0000ff). A no-op native
  //    path would leave both edges flat gray (R≈B≈128).
  const redEdge = scanReddest(nativeTile, SQUARE_MIN + 8, SQUARE_MIN + 8);
  const blueEdge = scanBluest(nativeTile, SQUARE_MAX - 8, SQUARE_MAX - 8);
  const rr = (redEdge >> 16) & 255;
  const rb = redEdge & 255;
  if (!(rr - rb > 30)) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] top-left bevel edge not red (R-B>30), got #${hex(redEdge)}`,
    );
  }
  const br = (blueEdge >> 16) & 255;
  const bb = blueEdge & 255;
  if (!(bb - br > 30)) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] bottom-right bevel edge not blue (B-R>30), got #${hex(blueEdge)}`,
    );
  }

  // 3) Parity: the native bevel matches the CPU reference within tolerance.
  const mismatch = getSurfaceMismatch(referenceSurface, nativeTile, CHANNEL_TOLERANCE);
  if (mismatch.fraction > MISMATCH_FRACTION) {
    throw new Error(
      `[filter-gradient-bevel-parity:${render()}] native bevel diverges from CPU reference — ` +
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

// Walk a short diagonal band around (cx, cy) and return the most-red / most-blue sample, so a thin
// tinted bevel edge that drifts a pixel or two between the CPU and the shader is still caught.
function scanReddest(tile: Readonly<Surface>, cx: number, cy: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let d = -6; d <= 6; d++) {
    const rgb = getSurfacePixelRgb(tile, cx + d, cy + d);
    const score = ((rgb >> 16) & 255) - (rgb & 255);
    if (score > bestScore) {
      bestScore = score;
      best = rgb;
    }
  }
  return best;
}

function scanBluest(tile: Readonly<Surface>, cx: number, cy: number): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let d = -6; d <= 6; d++) {
    const rgb = getSurfacePixelRgb(tile, cx + d, cy + d);
    const score = (rgb & 255) - ((rgb >> 16) & 255);
    if (score > bestScore) {
      bestScore = score;
      best = rgb;
    }
  }
  return best;
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
