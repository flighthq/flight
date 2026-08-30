import { createMatrix, createRectangle, multiplyMatrix } from '@flighthq/geometry/contract';
import { computeNodeBoundsRectangle } from '@flighthq/node/contract';
import {
  beginWgpuRenderPass,
  createWgpuOffscreenRenderState,
  createWgpuRenderTarget,
  destroyWgpuRenderState,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  endWgpuRenderPass,
  getWgpuRenderStateRuntime,
  resizeWgpuRenderTarget,
  registerWgpuRenderStateTeardown,
  setWgpuRenderTransform2D,
  withWgpuFrameBorrow,
} from '@flighthq/render-wgpu/contract';
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
  Matrix,
  Node2D,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
  Scene2DRenderer,
  WgpuDeviceState,
  WgpuPipeline,
  WgpuPresentationRenderState,
  WgpuRenderOptions,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types/contract';

import { renderWgpuScene2D } from './wgpuNode2D';
import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';

/**
 * Creates an offscreen render state for baking render caches consumed by `screenState`.
 *
 * Wgpu textures and pipelines cannot cross GPU devices, so — unlike the canvas backend —
 * this offscreen state shares the owner's explicit device tier. It owns its pipeline snapshot,
 * uniform ring, frame-local batch resources, and scene-graph bookkeeping; a bounded frame borrow
 * supplies only the live presentation encoder/pass while a bake is being recorded.
 */
export function createWgpuCacheState(
  ownerState: WgpuRenderState,
  deviceState: Readonly<WgpuDeviceState>,
  pipeline: Readonly<WgpuPipeline>,
  options: Readonly<WgpuRenderOptions> = {},
): WgpuRenderState {
  const cacheState = createWgpuOffscreenRenderState(deviceState, pipeline, options);
  // The explicit owner is retained only for late blend policy. Frame/resource ownership remains local,
  // and owner teardown closes this state exactly once.
  cacheState.applyBlendMode = null;
  const cacheRuntime = getWgpuRenderStateRuntime(cacheState);
  cacheRuntime.applyBlendModeParent = ownerState;
  registerWgpuRenderStateTeardown(ownerState, () => destroyWgpuRenderState(cacheState));
  return cacheState;
}

export function enableWgpuRenderCache(state: WgpuRenderState): void {
  registerRenderCacheRenderer(state, defaultWgpuRenderCacheRenderer);
}

/**
 * Allocates or resizes the texture `screenState` composites for `cache`, returning it so a
 * caller can render custom content into it directly. For engine-baked content prefer
 * refreshWgpuRenderCache.
 */
export function ensureWgpuRenderCacheTarget(
  state: WgpuRenderState,
  cache: RenderCache,
  width: number,
  height: number,
): WgpuRenderTarget {
  const targets = getTargets(state);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createWgpuRenderTarget(state, width, height);
    targets.set(cache, target);
  } else {
    resizeWgpuRenderTarget(state, target, width, height);
  }
  return target;
}

export function getWgpuRenderCacheTarget(state: WgpuRenderState, cache: RenderCache): WgpuRenderTarget | null {
  return _renderCacheTargets.get(state)?.get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then records
 * the transform that places the result back in scene space. Returns whether a bake happened —
 * the offscreen state's own dirtiness decides it (honoring its sceneGraphSyncPolicy), so this is
 * cheap to call every frame. Because the bake runs on the shared GPU device, it can composite its
 * owned target in the owner's frame without acquiring presentation capability itself.
 */
export function refreshWgpuRenderCache(
  ownerState: WgpuPresentationRenderState,
  cacheState: WgpuRenderState,
  cache: RenderCache,
  source: Node2D,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  return withWgpuFrameBorrow(ownerState, cacheState, () => {
    const padding = options?.padding ?? 0;
    const minWidth = options?.minWidth ?? 1;
    const minHeight = options?.minHeight ?? 1;

    computeNodeBoundsRectangle(_bounds, source, source);
    const { width, height } = computeRenderTargetSize(_targetSize, _bounds, padding, minWidth, minHeight);

    const existing = getWgpuRenderCacheTarget(ownerState, cache);
    const resized = existing === null || existing.width !== width || existing.height !== height;
    const target = ensureWgpuRenderCacheTarget(ownerState, cache, width, height);

    computeScene2DRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
    computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

    _yInvert.d = -1;
    _yInvert.ty = target.height;
    multiplyMatrix(_bakeTransform, _yInvert, _renderTransform);

    beginWgpuRenderPass(cacheState, target);
    try {
      setWgpuRenderTransform2D(cacheState, _bakeTransform);
      const dirty = prepareScene2DRender(cacheState, source);
      if (dirty || resized) renderWgpuScene2D(cacheState, source);
      return dirty || resized;
    } finally {
      endWgpuRenderPass(cacheState);
    }
  });
}

export function releaseWgpuRenderCache(state: WgpuRenderState, cache: RenderCache): void {
  const targets = _renderCacheTargets.get(state);
  if (targets === undefined) return;
  const target = targets.get(cache);
  if (target === undefined) return;
  // A WgpuRenderTarget owns GPU textures; GC will not free them.
  destroyWgpuRenderTarget(state, target);
  targets.delete(cache);
}

function drawWgpuRenderCache(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const cache = getRenderProxyCache(state, renderProxy.source);
  if (cache === null) return;
  const target = _renderCacheTargets.get(state)?.get(cache);
  if (target === undefined) return;
  // Drain pending batched geometry before the immediate composite quad. Like every other
  // immediate-draw renderer (RichText), this bypasses the quad-batch writer; without the flush the
  // immediate quad interleaves with the un-flushed batch's instance buffer and bind-group state,
  // corrupting the pending batch rather than merely reordering it.
  flushWgpuQuadBatchWriter(state);
  // renderProxy.transform2D already carries the cache placement transform (folded in by the
  // adapter), so the target composites with an identity offset.
  drawWgpuRenderTargetResult(state, renderProxy, target, _identity);
}

function getTargets(state: WgpuRenderState): Map<RenderCache, WgpuRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new Map();
    _renderCacheTargets.set(state, targets);
    registerWgpuRenderStateTeardown(state, destroyOwnedWgpuRenderCacheTargets);
  }
  return targets;
}

function destroyOwnedWgpuRenderCacheTargets(state: WgpuRenderState): void {
  const targets = _renderCacheTargets.get(state);
  if (targets === undefined) return;
  for (const target of targets.values()) destroyWgpuRenderTarget(state, target);
  targets.clear();
  _renderCacheTargets.delete(state);
}

export const defaultWgpuRenderCacheRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawWgpuRenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<WgpuRenderState, Map<RenderCache, WgpuRenderTarget>>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
const _bakeTransform = createMatrix() as Matrix;
const _targetSize = { width: 0, height: 0 };
const _yInvert = createMatrix() as Matrix;
const _identity = createMatrix() as Matrix;
