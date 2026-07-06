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
import type { DisplayObject, GlRenderState, GlRenderTarget } from '@flighthq/sdk';
import {
  applyDisplacementMapFilterToGl,
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
import type { NativeDisplacementSpec, ParityTarget } from './parity';

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
