// WebGL backend of the gradient-glow-parity test — the meaningful comparison in this suite.
//
// Native path: the real WebGL gradient glow is a multi-pass shader (a tint pass to extract the
// silhouette, a separable box blur, and a gradient-ramp lookup keyed off the blurred alpha) run over
// offscreen render targets via applyGradientGlowFilterToWebGL, then composited onto the screen as a
// positioned quad. This mirrors the engine's render-cache flow (packages/render-webgl/src/webglCache.ts):
// render content into a target, run the GPU passes, composite the result via drawWebGLRenderTargetResult.
//
// Unlike the Gaussian blur (applyGaussianBlurFilterToWebGL takes a single ping-pong `temp` target), the
// gradient glow takes a `scratch` ARRAY of three same-sized targets and builds its gradient ramp texture
// internally each call from filter.colors/alphas/ratios (createWebGLGradientRampTexture) — so this file
// allocates source + dest + three scratch targets, and passes no ramp/displacement texture of its own.
// It is a single call (no separate apply per pass) and clears `dest` itself.
//
// Flow per drawNativeGradientGlow():
//   1. createWebGLRenderTarget for source, dest, and three scratch targets (s0/s1/s2), all TILE-sized.
//   2. Render the source bitmap into the `source` target (beginWebGLRenderTarget with an identity render
//      transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   3. applyGradientGlowFilterToWebGL(state, source, dest, [s0,s1,s2], filter) — the shader glow.
//   4. bindScreenFramebuffer — the fullscreen passes leave a scratch framebuffer/viewport bound; rebind
//      the default framebuffer and full-canvas viewport before compositing onto the screen.
//   5. Prepare a placement bitmap node at the native tile position to harvest its world×device transform,
//      then drawWebGLRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result
//      at that position (the composite V-flips, matching how step 2 wrote the target — the same render
//      convention the cache relies on, so the result lands upright).
//   6. destroyWebGLRenderTarget for all five targets (they own framebuffers/textures the GC won't free).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU glow runs at the same
// resolution the CPU/surface reference glows at; the composite upscales by the device transform exactly
// as the reference bitmap tile does. This keeps the two tiles at matching effective resolution.
import type { DisplayObject, WebGLRenderState, WebGLRenderTarget } from '@flighthq/sdk';
import {
  applyGradientGlowFilterToWebGL,
  beginWebGLRenderTarget,
  BitmapKind,
  createBitmap,
  createMatrix,
  createWebGLCanvasElement,
  createWebGLRenderState,
  createWebGLRenderTarget,
  defaultWebGLBitmapRenderer,
  destroyWebGLRenderTarget,
  drawWebGLRenderTargetResult,
  endWebGLRenderTarget,
  getOrCreateRenderProxy2D,
  getWebGLRenderStateRuntime,
  prepareDisplayObjectRender,
  registerDefaultWebGLMaterial,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLDisplayObject,
} from '@flighthq/sdk';

import { registerFunctionalTarget } from '../../_harness/verify';
import type { NativeGradientGlowSpec, ParityTarget } from './parity';

export function createParityTarget(width: number, height: number, background: number): ParityTarget {
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = createWebGLCanvasElement(width, height, pixelRatio);
  document.body.appendChild(canvas);

  const state = createWebGLRenderState(canvas, {
    pixelRatio,
    backgroundColor: background,
    // preserveDrawingBuffer so the verifier can read the frame back after rendering.
    contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  });
  // Device transform carries DPI: the scene is authored in logical units, scaled to the backing store.
  state.renderTransform2D = createMatrix(pixelRatio, 0, 0, pixelRatio, 0, 0);

  registerDefaultWebGLMaterial(state);
  registerRenderer(state, BitmapKind, defaultWebGLBitmapRenderer);

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
  state: WebGLRenderState,
  source: ReturnType<typeof createBitmap>,
  target: WebGLRenderTarget,
): void {
  beginWebGLRenderTarget(state, target, _identity);
  state.gl.clearColor(0, 0, 0, 0);
  state.gl.clear(state.gl.COLOR_BUFFER_BIT);
  prepareDisplayObjectRender(state, source);
  renderWebGLDisplayObject(state, source);
  endWebGLRenderTarget(state);
}

function compositeNativeGradientGlow(state: WebGLRenderState, spec: Readonly<NativeGradientGlowSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createWebGLRenderTarget(state, { width: size, height: size });
  const destTarget = createWebGLRenderTarget(state, { width: size, height: size });
  // Three scratch targets — the gradient glow needs a tint buffer plus a blur ping-pong pair.
  const scratch0 = createWebGLRenderTarget(state, { width: size, height: size });
  const scratch1 = createWebGLRenderTarget(state, { width: size, height: size });
  const scratch2 = createWebGLRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real WebGL gradient glow: builds the ramp from spec.filter internally, blurs the silhouette,
  // looks the blurred alpha up in the ramp, and composites glow-under-source into destTarget.
  applyGradientGlowFilterToWebGL(state, sourceTarget, destTarget, [scratch0, scratch1, scratch2], spec.filter);

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
  // exactly like the render-cache composite (drawWebGLRenderCache passes _identity).
  drawWebGLRenderTargetResult(state, proxy, destTarget, _identity);

  // The render targets own framebuffers/textures the GC will not free.
  destroyWebGLRenderTarget(state, sourceTarget);
  destroyWebGLRenderTarget(state, destTarget);
  destroyWebGLRenderTarget(state, scratch0);
  destroyWebGLRenderTarget(state, scratch1);
  destroyWebGLRenderTarget(state, scratch2);
}

// Rebinds the default (screen) framebuffer and the full-canvas viewport, and resets the runtime's cached
// framebuffer/viewport so subsequent draws target the screen. Mirrors the state the screen walk runs
// under (framebuffer null, renderTargetViewport null → viewport = canvas).
function bindScreenFramebuffer(state: WebGLRenderState): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, state.canvas.width, state.canvas.height);
  runtime.currentFramebuffer = null;
  runtime.renderTargetViewport = null;
  runtime.currentTexture = null;
  runtime.currentBlendMode = null;
  runtime.currentProgram = null;
}

function renderParity(state: WebGLRenderState, root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}

const _identity = createMatrix();
