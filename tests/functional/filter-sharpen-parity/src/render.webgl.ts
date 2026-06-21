// WebGL backend of the sharpen-parity test.
//
// Native path: the real WebGL sharpen is an unsharp mask (applySharpenFilterToWebGL) — a box-blur into
// scratch targets followed by a single full-screen pass that computes source + (source - blurred) *
// amount. It runs over offscreen render targets, then is composited onto the screen as a positioned
// quad. This mirrors the engine's own render-cache flow (packages/render-webgl/src/webglCache.ts):
// render content into a target, run the GPU passes, composite via drawWebGLRenderTargetResult.
//
// applySharpenFilterToWebGL's signature differs from the blur's: it takes (state, source, dest,
// scratch[], filter) where scratch is an array of TWO render targets — scratch[0] holds the blurred
// image, scratch[1] is the blur's ping-pong temp. There is no separate `temp` positional argument and
// the unsharp step itself is a single pass writing source/blurred into dest.
//
// Flow per drawNativeSharpen():
//   1. Render the source bitmap into a TILE-sized `source` target (beginWebGLRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applySharpenFilterToWebGL(state, source, dest, [blurred, blurTemp], {blurX, blurY, amount}).
//   3. bindScreenFramebuffer — the GPU passes leave a render-target framebuffer/viewport bound; the
//      inline flow must restore the screen before compositing (the render cache avoids this because its
//      composite runs during the on-screen walk).
//   4. Prepare a placement bitmap node at the native tile position to harvest its world×device
//      transform, then drawWebGLRenderTargetResult(state, proxy, dest, identity) to composite the
//      TILE×TILE result at that position (the composite V-flips, matching how step 1 wrote the target).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU sharpen runs at the same
// resolution the CPU/surface reference sharpens at; the composite upscales by the device transform
// exactly as the reference bitmap tile does. This keeps the two tiles at matching effective resolution.
import type { DisplayObject, WebGLRenderState, WebGLRenderTarget } from '@flighthq/sdk';
import {
  applySharpenFilterToWebGL,
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
import type { NativeSharpenSpec, ParityTarget } from './parity';

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

function compositeNativeSharpen(state: WebGLRenderState, spec: Readonly<NativeSharpenSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createWebGLRenderTarget(state, { width: size, height: size });
  const destTarget = createWebGLRenderTarget(state, { width: size, height: size });
  // applySharpenFilterToWebGL needs TWO scratch targets: scratch[0] = blurred, scratch[1] = blur temp.
  const blurredTarget = createWebGLRenderTarget(state, { width: size, height: size });
  const blurTempTarget = createWebGLRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real WebGL sharpen: unsharp mask (box-blur the source into scratch[0] via scratch[1], then
  // dest = source + (source - blurred) * amount). Matches the surface sharpen's blurX/blurY/amount.
  applySharpenFilterToWebGL(state, sourceTarget, destTarget, [blurredTarget, blurTempTarget], {
    blurX: spec.blurX,
    blurY: spec.blurY,
    amount: spec.amount,
  });

  // The filter passes (drawWebGLFullscreenPass) leave a render-target framebuffer bound and a tile-sized
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
  // exactly like the render-cache composite (drawWebGLRenderCache passes _identity).
  drawWebGLRenderTargetResult(state, proxy, destTarget, _identity);

  // The render targets own framebuffers/textures the GC will not free.
  destroyWebGLRenderTarget(state, sourceTarget);
  destroyWebGLRenderTarget(state, destTarget);
  destroyWebGLRenderTarget(state, blurredTarget);
  destroyWebGLRenderTarget(state, blurTempTarget);
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
