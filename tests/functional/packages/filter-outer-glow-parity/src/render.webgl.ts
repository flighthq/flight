// Gl backend of the outer-glow-parity test.
//
// Native path: the real Gl outer glow is a tint+box-blur shader chain run over offscreen render
// targets (applyOuterGlowFilterToGl), which ALSO composites the source on top into `dest` (unless
// knockout) — so a single dest target carries the finished glow+source. The result is then composited
// onto the screen as a positioned quad. This mirrors the engine's own render-cache flow
// (packages/displayobject-gl/src/webglCache.ts): render content into a target, run the GPU passes,
// composite the result via drawGlRenderTargetResult.
//
// applyOuterGlowFilterToGl's signature differs from the blur's: it takes (state, source, dest,
// scratch[], filter) where `scratch` is THREE same-sized targets it uses internally as the tint mask,
// the blurred glow, and the box-blur ping-pong temp. It allocates nothing itself and writes the finished
// effect into `dest`. There is no separate source re-blit and no gradient-ramp / displacement-map
// texture (those belong to other filters, not outer glow).
//
// Flow per drawNativeGlow():
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applyOuterGlowFilterToGl(state, source, dest, [mask, blurred, blurTemp], filter) — the glow
//      chain, leaving glow+source composited in `dest`.
//   3. Rebind the screen framebuffer/viewport (the passes leave a target bound), prepare a placement
//      bitmap node at the native tile position to harvest its world×device transform, then
//      drawGlRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result at
//      that position (the composite V-flips, matching how step 1 wrote the target — same convention the
//      render cache relies on, so the result lands upright).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU glow runs at the same
// resolution the CPU/surface reference glows at; the composite upscales by the device transform exactly
// as the reference bitmap tile does. This keeps the two tiles at matching effective resolution.
import type { Bitmap, DisplayObject, GlRenderState, GlRenderTarget } from '@flighthq/sdk';
import {
  applyOuterGlowFilterToGl,
  beginGlRenderTarget,
  BitmapKind,
  createBitmap,
  createGlCanvasElement,
  createGlRenderState,
  createGlRenderTarget,
  createMatrix,
  defaultGlBitmapRenderer,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
  endGlRenderTarget,
  getGlRenderStateRuntime,
  getOrCreateRenderProxy2D,
  prepareDisplayObjectRender,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlDisplayObject,
} from '@flighthq/sdk';

import { registerFunctionalTarget } from '../../_harness/verify';
import type { NativeGlowSpec, ParityTarget } from './parity';

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
  const pending: NativeGlowSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on Gl — the glow is the GPU shader chain below.
    applyNativeGlow(): void {},
    drawNativeGlow(spec: Readonly<NativeGlowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeGlow(state, spec);
      void 0; // DIAG
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

function compositeNativeGlow(state: GlRenderState, spec: Readonly<NativeGlowSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // applyOuterGlowFilterToGl needs three scratch targets: tint mask, blurred glow, blur ping-pong temp.
  const maskTarget = createGlRenderTarget(state, { width: size, height: size });
  const blurredTarget = createGlRenderTarget(state, { width: size, height: size });
  const blurTempTarget = createGlRenderTarget(state, { width: size, height: size });

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl outer glow: tint the silhouette, box-blur it, blit the glow into dest, then composite
  // the source on top — all into destTarget. Matches the CPU/surface reference (glow under, source over).
  applyOuterGlowFilterToGl(state, sourceTarget, destTarget, [maskTarget, blurredTarget, blurTempTarget], {
    color: spec.filter.color,
    alpha: spec.filter.alpha,
    blurX: spec.filter.blurX,
    blurY: spec.filter.blurY,
    strength: spec.filter.strength,
    quality: spec.filter.quality,
    knockout: spec.filter.knockout,
  });

  // The glow passes leave the dest/scratch framebuffer bound and a tile-sized viewport — they do not
  // restore the screen. The render cache avoids this because its composite runs during the on-screen
  // walk; this inline flow must rebind the default framebuffer and full-canvas viewport itself before
  // compositing, or the result would draw into a glow target, not the screen.
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
