import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import { computeNodeRootLocalBoundsRectangle } from '@flighthq/node/contract';
import {
  beginGlRenderPass,
  createGlOffscreenRenderState,
  createGlRenderTarget,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
  endGlRenderPass,
  resizeGlRenderTarget,
  setGlRenderTransform2D,
} from '@flighthq/render-gl/contract';
import {
  computeScene2DRenderTargetTransform,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  getRenderProxyCache,
  noopRendererData,
  prepareScene2DRender,
  registerRenderCacheRenderer,
} from '@flighthq/render/contract';
import type {
  Node2D,
  Scene2DRenderer,
  GlRenderState,
  GlRenderTarget,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
} from '@flighthq/types/contract';

import { renderGlScene2D } from './glNode2D';
import { flushGlQuadBatchWriter } from './glQuadBatchWriter';

/**
 * Creates an offscreen render state for baking render caches consumed by `screenState`.
 *
 * Gl textures and framebuffers cannot cross GL contexts, so — unlike the canvas backend —
 * this offscreen state must share the screen state's GL context and every context-bound
 * resource (shaders, buffers, the uploaded-texture cache). What it keeps separate is the
 * scene-graph bookkeeping: its own render node map, adapter map, and frame counter, so baking
 * neither substitutes a cache into itself nor disturbs the screen state's nodes.
 */
export function createGlCacheState(screenState: GlRenderState): GlRenderState {
  const cacheState = createGlOffscreenRenderState(screenState);
  // Adapter maps are deliberately fresh on the derived state. In particular, the cache adapter
  // attached on the screen state is absent while this state renders the content that populates it.
  _cacheStateScreen.set(cacheState, screenState);
  return cacheState;
}

export function enableGlRenderCache(state: GlRenderState): void {
  registerRenderCacheRenderer(state, defaultGlRenderCacheRenderer);
}

/**
 * Allocates or resizes the framebuffer-backed texture `screenState` composites for `cache`,
 * returning it so a caller can render custom content into it directly. For engine-baked
 * content prefer refreshGlRenderCache.
 */
export function ensureGlRenderCacheTarget(
  state: GlRenderState,
  cache: RenderCache,
  width: number,
  height: number,
): GlRenderTarget {
  const targets = getTargets(state);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createGlRenderTarget(state, { width, height });
    targets.set(cache, target);
  } else {
    resizeGlRenderTarget(state, target, width, height);
  }
  return target;
}

// Cache rendering uses a second render state over the screen state's GL context. Backend resources
// that must remain visible while that cache state walks a subtree are owned by the screen state.
export function getGlRenderCacheScreenState(state: GlRenderState): GlRenderState {
  return _cacheStateScreen.get(state) ?? state;
}

export function getGlRenderCacheTarget(state: GlRenderState, cache: RenderCache): GlRenderTarget | null {
  return getTargets(state).get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then records
 * the transform that places the result back in scene space. Returns whether a bake happened —
 * the offscreen state's own dirtiness decides it (honoring its sceneGraphSyncPolicy), so this is
 * cheap to call every frame. The render-pass bracket owns the shared GL context while the cache
 * state bakes, then restores the screen pass and invalidates both states' binding caches.
 */
export function refreshGlRenderCache(
  cacheState: GlRenderState,
  cache: RenderCache,
  source: Node2D,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  const screenState = getGlRenderCacheScreenState(cacheState);
  const padding = options?.padding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;

  computeNodeRootLocalBoundsRectangle(_bounds, source);
  const { width, height } = computeRenderTargetSize(_targetSize, _bounds, padding, minWidth, minHeight);

  const existing = getGlRenderCacheTarget(screenState, cache);
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureGlRenderCacheTarget(screenState, cache, width, height);

  computeScene2DRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  // Preserve on begin — the bake below clears and redraws only when dirty; clearing here would wipe the
  // retained cache content on the not-dirty path. The cache's local-space transform is set explicitly,
  // since a pass no longer carries one.
  beginGlRenderPass(cacheState, target, { preserveColor: true, preserveDepth: true });
  let dirty = false;
  try {
    setGlRenderTransform2D(cacheState, _renderTransform);
    dirty = prepareScene2DRender(cacheState, source);
    if (dirty || resized) {
      cacheState.gl.clearColor(0, 0, 0, 0);
      cacheState.gl.clear(cacheState.gl.COLOR_BUFFER_BIT);
      renderGlScene2D(cacheState, source);
    }
  } finally {
    endGlRenderPass(cacheState);
  }

  return dirty || resized;
}

export function releaseGlRenderCache(state: GlRenderState, cache: RenderCache): void {
  const targets = getTargets(state);
  const target = targets.get(cache);
  if (target === undefined) return;
  // A GlRenderTarget owns a framebuffer and texture; GC will not free them.
  destroyGlRenderTarget(state, target);
  targets.delete(cache);
}

function drawGlRenderCache(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const cache = getRenderProxyCache(state, renderProxy.source);
  if (cache === null) return;
  const target = getTargets(state).get(cache);
  if (target === undefined) return;
  // Drain pending batched geometry before the immediate composite quad. Like every other
  // immediate-draw renderer (RichText, Scale9), this bypasses the quad-batch writer; without the
  // flush the cached result draws ahead of geometry submitted earlier in the walk, which only
  // flushes at the end — producing out-of-order replay (a doubled image on Gl).
  flushGlQuadBatchWriter(state);
  // renderProxy.transform2D already carries the cache placement transform (folded in by the
  // adapter), so the target composites with an identity offset.
  drawGlRenderTargetResult(state, renderProxy, target, _identity);
}

function getTargets(state: GlRenderState): WeakMap<RenderCache, GlRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _renderCacheTargets.set(state, targets);
  }
  return targets;
}

export const defaultGlRenderCacheRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawGlRenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<GlRenderState, WeakMap<RenderCache, GlRenderTarget>>();
// Links an offscreen cache state back to the screen state whose targets it bakes into.
const _cacheStateScreen = new WeakMap<GlRenderState, GlRenderState>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
const _identity = createMatrix() as Matrix;
const _targetSize = { width: 0, height: 0 };
