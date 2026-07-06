// Gl backend of the inner-shadow-parity test — the meaningful comparison this test exists for.
//
// Native path: the real Gl inner shadow is a multi-pass shader (applyInnerShadowFilterToGl) run
// over offscreen render targets, then composited onto the screen as a positioned quad. This mirrors the
// engine's own render-cache flow (packages/displayobject-gl/src/webglCache.ts): render content into a target,
// run the GPU passes, composite the result via drawGlRenderTargetResult.
//
// Unlike the blur native path, applyInnerShadowFilterToGl takes its scratch as a SINGLE array of three
// render targets (it ping-pongs internally), not three positional source/dest/temp args, and it produces
// the FINAL composited image (source + clipped inner shadow) directly into `dest` — so `dest` is what we
// composite, the same byte content the surface reference produced.
//
// Flow per drawNativeInnerShadow():
//   1. Render the source bitmap into a TILE-sized `source` target (beginGlRenderTarget with an
//      identity render transform → the origin-placed bitmap fills the target's 0..TILE viewport).
//   2. applyInnerShadowFilterToGl(state, source, dest, [s0,s1,s2], filter) — the shader inner shadow.
//   3. bindScreenFramebuffer — the filter passes leave a scratch framebuffer/viewport bound; restore the
//      default framebuffer + full-canvas viewport before compositing onto the screen.
//   4. Prepare a placement bitmap node at the native tile position to harvest its world×device transform,
//      then drawGlRenderTargetResult(state, proxy, dest, identity) to composite the TILE×TILE result at
//      that position (the composite V-flips, matching how step 1 wrote the target).
//
// Targets are sized in LOGICAL pixels (TILE), not device pixels, so the GPU filter runs at the same
// resolution the CPU/surface reference filters at; the composite upscales by the device transform exactly
// as the reference bitmap tile does. This keeps the two tiles at matching effective resolution.
import type { Bitmap, DisplayObject, GlRenderState, GlRenderTarget, InnerShadowFilter } from '@flighthq/sdk';
import {
  applyInnerShadowFilterToGl,
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

import { registerFunctionalTarget } from '@ft/verify';
import type { NativeInnerShadowSpec, ParityTarget } from './parity';

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

  // Pending GPU inner shadows, applied after the scene draws (so the composite lands over the tiles).
  const pending: NativeInnerShadowSpec[] = [];

  return {
    kind: 'webgl',
    width,
    height,
    scale: pixelRatio,
    // No CSS-filter path on Gl — the inner shadow is the GPU shader pass below.
    applyNativeInnerShadow(_node: Bitmap, _filter: Readonly<InnerShadowFilter>): void {},
    drawNativeInnerShadow(spec: Readonly<NativeInnerShadowSpec>): void {
      pending.push({ ...spec });
    },
    render(root: DisplayObject): void {
      renderParity(state, root);
      for (const spec of pending) compositeNativeInnerShadow(state, spec);
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

function compositeNativeInnerShadow(state: GlRenderState, spec: Readonly<NativeInnerShadowSpec>): void {
  const size = spec.tile;

  // The source bitmap drawn at origin, sized to one logical tile.
  const sourceBitmap = createBitmap();
  sourceBitmap.data.image = spec.source;
  sourceBitmap.data.smoothing = false;
  sourceBitmap.x = 0;
  sourceBitmap.y = 0;

  const sourceTarget = createGlRenderTarget(state, { width: size, height: size });
  const destTarget = createGlRenderTarget(state, { width: size, height: size });
  // applyInnerShadowFilterToGl ping-pongs across THREE scratch targets passed as one array.
  const scratch = [
    createGlRenderTarget(state, { width: size, height: size }),
    createGlRenderTarget(state, { width: size, height: size }),
    createGlRenderTarget(state, { width: size, height: size }),
  ];

  renderSourceIntoTarget(state, sourceBitmap, sourceTarget);

  // The real Gl inner shadow: invert-tint → blur → offset → clip-to-source-alpha → composite
  // (source + clipped shadow) into destTarget. Same filter config the surface reference used, minus the
  // `type` tag the Gl entry omits.
  applyInnerShadowFilterToGl(state, sourceTarget, destTarget, scratch, {
    alpha: spec.filter.alpha,
    angle: spec.filter.angle,
    blurX: spec.filter.blurX,
    blurY: spec.filter.blurY,
    color: spec.filter.color,
    distance: spec.filter.distance,
    quality: spec.filter.quality,
    strength: spec.filter.strength,
  });

  // The filter passes (drawGlFullscreenPass) leave a scratch framebuffer bound and a tile-sized
  // viewport — they do not restore the screen. The render cache avoids this because its composite runs
  // during the on-screen walk; this inline flow must rebind the default framebuffer and full-canvas
  // viewport itself before compositing, or the result would draw into a filter target, not the screen.
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
  for (const s of scratch) destroyGlRenderTarget(state, s);
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
