import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import { computeNodeRootLocalBoundsRectangle } from '@flighthq/node/contract';
import {
  beginGlRenderPass,
  createGlRenderState,
  createGlTextureRenderTarget,
  destroyGlRenderState,
  destroyGlTextureRenderTarget,
  drawGlTextureRenderTargetResult,
  endGlRenderPass,
  getGlCurrentRenderPass,
  resizeGlTextureRenderTarget,
  registerGlRenderStateTeardown,
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
  GlPipeline,
  GlRenderOptions,
  GlTextureRenderTarget,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
} from '@flighthq/types/contract';

import { renderGlScene2D } from './glNode2D';
import { flushGlQuadBatchWriter } from './glQuadBatchWriter';

export function createGlCacheState(
  ownerState: GlRenderState,
  pipeline: Readonly<GlPipeline>,
  options: GlRenderOptions = {},
): GlRenderState {
  const cacheState = createGlRenderState(ownerState.gl, pipeline, options);
  registerGlRenderStateTeardown(ownerState, () => destroyGlRenderState(cacheState));
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
  ownerState: GlRenderState,
  cache: RenderCache,
  width: number,
  height: number,
): GlTextureRenderTarget {
  const targets = ensureTargets(ownerState);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createGlTextureRenderTarget(ownerState, { width, height });
    targets.set(cache, target);
  } else {
    resizeGlTextureRenderTarget(ownerState, target, width, height);
  }
  return target;
}

export function getGlRenderCacheTarget(ownerState: GlRenderState, cache: RenderCache): GlTextureRenderTarget | null {
  return _renderCacheTargets.get(ownerState)?.get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then records
 * the transform that places the result back in scene space. Returns whether a bake happened —
 * the offscreen state's own dirtiness decides it (honoring its sceneGraphSyncPolicy), so this is
 * cheap to call every frame. The render-pass bracket owns the shared GL context while the cache
 * state bakes, then restores the screen pass and invalidates both states' binding caches.
 */
export function refreshGlRenderCache(
  ownerState: GlRenderState,
  cacheState: GlRenderState,
  cache: RenderCache,
  source: Node2D,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  const padding = options?.padding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;

  computeNodeRootLocalBoundsRectangle(_bounds, source);
  const { width, height } = computeRenderTargetSize(_targetSize, _bounds, padding, minWidth, minHeight);

  const existing = getGlRenderCacheTarget(ownerState, cache);
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureGlRenderCacheTarget(ownerState, cache, width, height);

  computeScene2DRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  // Preserve on begin — the bake below clears and redraws only when dirty; clearing here would wipe the
  // retained cache content on the not-dirty path. The cache's local-space transform is set explicitly,
  // since a pass no longer carries one.
  const pass = beginGlRenderPass(cacheState, target);
  let dirty = false;
  try {
    setGlRenderTransform2D(cacheState, _renderTransform);
    dirty = prepareScene2DRender(cacheState, source);
    if (dirty || resized) {
      cacheState.gl.clearColor(0, 0, 0, 0);
      cacheState.gl.clear(cacheState.gl.COLOR_BUFFER_BIT);
      renderGlScene2D(pass, source);
    }
  } finally {
    endGlRenderPass(pass);
  }

  return dirty || resized;
}

export function releaseGlRenderCache(ownerState: GlRenderState, cache: RenderCache): void {
  const targets = _renderCacheTargets.get(ownerState);
  if (targets === undefined) return;
  const target = targets.get(cache);
  if (target === undefined) return;
  // A GlTextureRenderTarget owns a framebuffer and texture; GC will not free them.
  destroyGlTextureRenderTarget(target);
  targets.delete(cache);
}

function drawGlRenderCache(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const cache = getRenderProxyCache(state, renderProxy.source);
  if (cache === null) return;
  const target = _renderCacheTargets.get(state)?.get(cache);
  if (target === undefined) return;
  // Drain pending batched geometry before the immediate composite quad. Like every other
  // immediate-draw renderer (RichText, Scale9), this bypasses the quad-batch writer; without the
  // flush the cached result draws ahead of geometry submitted earlier in the walk, which only
  // flushes at the end — producing out-of-order replay (a doubled image on Gl).
  flushGlQuadBatchWriter(state);
  // renderProxy.transform2D already carries the cache placement transform (folded in by the
  // adapter), so the target composites with an identity offset.
  drawGlTextureRenderTargetResult(getGlCurrentRenderPass(state)!, renderProxy, target, _identity);
}

function ensureTargets(ownerState: GlRenderState): Map<RenderCache, GlTextureRenderTarget> {
  let targets = _renderCacheTargets.get(ownerState);
  if (targets === undefined) {
    targets = new Map();
    _renderCacheTargets.set(ownerState, targets);
    registerGlRenderStateTeardown(ownerState, destroyOwnedGlRenderCacheTargets);
  }
  return targets;
}

function destroyOwnedGlRenderCacheTargets(ownerState: GlRenderState): void {
  const targets = _renderCacheTargets.get(ownerState);
  if (targets === undefined) return;
  for (const target of targets.values()) destroyGlTextureRenderTarget(target);
  targets.clear();
  _renderCacheTargets.delete(ownerState);
}

export const defaultGlRenderCacheRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawGlRenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<GlRenderState, Map<RenderCache, GlTextureRenderTarget>>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
const _identity = createMatrix() as Matrix;
const _targetSize = { width: 0, height: 0 };
