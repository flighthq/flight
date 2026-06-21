// WebGL backend of the convolution-parity test.
//
// Native path: the real WebGL convolution is a SINGLE-pass shader (applyConvolutionFilterToWebGL) run over
// an offscreen render target, then composited onto the screen as a positioned quad. This mirrors the
// engine's own render-cache flow (packages/render-webgl/src/webglCache.ts): render content into a target,
// run the GPU pass, composite the result via drawWebGLRenderTargetResult.
//
// Unlike blur-parity (a separable multi-pass Gaussian that ping-pongs through a `temp` target), convolution
// is one pass: applyConvolutionFilterToWebGL(state, source, dest, filter) — only two targets, NO temp, NO
// gradient ramp, NO displacement-map texture. The shader samples the source texture with the kernel and
// writes dest directly.
//
// Flow per drawNativeConvolution():
//   1. Render the source bitmap into a TILE-sized `source` target (beginWebGLRenderTarget with an identity
//      render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applyConvolutionFilterToWebGL(state, source, dest, filter) — the convolution shader, source → dest.
//   3. bindScreenFramebuffer(state) — the fullscreen pass leaves dest's framebuffer/viewport bound; rebind
//      the default framebuffer + full-canvas viewport before compositing, or the result would draw into the
//      convolution target instead of the screen.
//   4. Prepare a placement bitmap node at the native tile position to harvest its world×device transform,
//      then drawWebGLRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result at
//      that position (the composite V-flips, matching how step 1 wrote the target — the same convention the
//      render cache relies on, so the result lands upright).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU convolution runs at the same
// resolution the CPU/surface reference convolves at; the composite upscales by the device transform exactly
// as the reference bitmap tile does. This keeps the two tiles at matching effective resolution and texel
// size — load-bearing for convolution, whose kernel offsets are one texel.
import type { DisplayObject, WebGLRenderState, WebGLRenderTarget } from '@flighthq/sdk';
import {
  applyConvolutionFilterToWebGL,
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
import type { NativeConvolutionSpec, ParityTarget } from './parity';

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

  // Pending GPU convolutions, applied after the scene draws (so the composite lands over the tiles).
  const pending: NativeConvolutionSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on WebGL (or any backend) — the convolution is the GPU shader pass below.
    applyNativeConvolution(): void {},
    drawNativeConvolution(spec: Readonly<NativeConvolutionSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeConvolution(state, spec);
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

function compositeNativeConvolution(state: WebGLRenderState, spec: Readonly<NativeConvolutionSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createWebGLRenderTarget(state, { width: size, height: size });
  const destTarget = createWebGLRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real WebGL convolution: a single fullscreen pass that samples sourceTarget with the kernel and
  // writes destTarget. The kernel MUST match the surface reference (same matrix/dims/divisor) for parity;
  // both default to edge:'clamp' and preserveAlpha:true, so the descriptor alone keeps them in step.
  applyConvolutionFilterToWebGL(state, sourceTarget, destTarget, spec.filter);

  // The fullscreen pass (drawWebGLFullscreenPass) leaves dest's framebuffer bound and a tile-sized
  // viewport — it does not restore the screen. The render cache avoids this because its composite runs
  // during the on-screen walk; this inline flow must rebind the default framebuffer and full-canvas
  // viewport itself before compositing, or the result would draw into the convolution target, not the screen.
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
}

// Rebinds the default (screen) framebuffer and the full-canvas viewport, and resets the runtime's cached
// framebuffer/viewport so subsequent draws target the screen. Mirrors the state the screen walk runs under
// (framebuffer null, renderTargetViewport null → viewport = canvas).
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
