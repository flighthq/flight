import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import { computeNodeBoundsRectangle } from '@flighthq/node/contract';
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
  CanvasPipeline,
  CanvasRenderOptions,
  CanvasRenderSurface,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasTextureResolvers,
  Node2D,
  Scene2DRenderer,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types/contract';

import { renderCanvasScene2D } from './canvasNode2D';
import {
  createCanvasRenderState,
  destroyCanvasRenderState,
  getCanvasRenderStateRuntime,
  registerCanvasRenderStateTeardown,
} from './canvasRenderState';
import { setCanvasRenderStateHandles } from './canvasRenderStateHandles';
import {
  createCanvasRenderTarget,
  destroyCanvasRenderTarget,
  resizeCanvasRenderTarget,
  setCanvasRenderTransform2D,
} from './canvasRenderTarget';
import { setCanvasTransform } from './canvasTransform';

/**
 * Creates a dedicated offscreen render state for baking render caches consumed by
 * `screenState`. It copies the screen state's renderers and propagates the settings that
 * affect rendering (pixel ratio, sync policy, rounding, smoothing, appearance hooks) so a
 * baked subtree looks the same offscreen as it would on screen — but keeps its own render
 * node map, adapter map, and frame counter, so baking never touches the screen state.
 */
export function createCanvasCacheState(
  ownerState: CanvasRenderState,
  surface: CanvasRenderSurface,
  pipeline: Readonly<CanvasPipeline>,
  canvasTextureResolvers: CanvasTextureResolvers,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  const cacheState = createCanvasOffscreenRenderState(surface, pipeline, canvasTextureResolvers, options);
  registerCanvasRenderStateTeardown(ownerState, () => destroyCanvasRenderState(cacheState));
  return cacheState;
}

/**
 * Creates an independent offscreen pipeline whose Canvas targets remain owned by `screenState`.
 * Renderers and policy registrations are creation-time snapshots; traversal/proxy state and host
 * canvases remain independent.
 */
export function createCanvasOffscreenRenderState(
  surface: CanvasRenderSurface,
  pipeline: Readonly<CanvasPipeline>,
  canvasTextureResolvers: CanvasTextureResolvers,
  options: Partial<CanvasRenderOptions> = {},
): CanvasRenderState {
  return createCanvasRenderState(surface, pipeline, canvasTextureResolvers, options);
}

export function destroyCanvasRenderCacheTarget(state: CanvasRenderState, cache: RenderCache): void {
  // Explicitly collapses the offscreen canvas backing this cache's render target so the browser
  // can reclaim its compositor/GPU memory immediately, rather than waiting for GC. After calling
  // this, the target is invalid.
  const targets = getTargets(state);
  const target = targets.get(cache);
  if (target !== undefined) {
    destroyCanvasRenderTarget(target);
    targets.delete(cache);
  }
}

export function enableCanvasRenderCache(state: RenderState): void {
  registerRenderCacheRenderer(state, defaultCanvasRenderCacheRenderer);
}

/**
 * Allocates or resizes the render target `screenState` composites for `cache`, returning it
 * so a caller can draw custom content into `target.context` directly (for example a filtered
 * image). For engine-baked content prefer refreshCanvasRenderCache.
 */
export function ensureCanvasRenderCacheTarget(
  state: CanvasRenderState,
  cache: RenderCache,
  width: number,
  height: number,
): CanvasRenderTarget {
  const targets = getTargets(state);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createCanvasRenderTarget(state.surface.creator, width, height);
    targets.set(cache, target);
  } else {
    resizeCanvasRenderTarget(target, width, height);
  }
  return target;
}

export function getCanvasRenderCacheTarget(state: CanvasRenderState, cache: RenderCache): CanvasRenderTarget | null {
  return _renderCacheTargets.get(state)?.get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then
 * records the transform that places the result back in scene space. The bake runs on the
 * offscreen state, so it neither substitutes the cache into itself nor disturbs the screen
 * state's render nodes — no adapter suppression needed.
 *
 * Returns whether a bake actually happened: the offscreen state's own dirtiness decides it
 * (honoring its sceneGraphSyncPolicy), so this is cheap to call every frame — it redraws only
 * when the subtree changed or the target was resized. The target is owned by the screen state
 * (keyed by the handle), never by the handle, so one handle can be composited by several states.
 */
export function refreshCanvasRenderCache(
  ownerState: CanvasRenderState,
  cacheState: CanvasRenderState,
  cache: RenderCache,
  source: Node2D,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  const padding = options?.padding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;

  computeNodeBoundsRectangle(_bounds, source, source);
  const { width, height } = computeRenderTargetSize(_targetSize, _bounds, padding, minWidth, minHeight);

  const existing = getCanvasRenderCacheTarget(ownerState, cache);
  // A canvas resize clears its pixels, so a resized target must be redrawn even if the
  // subtree itself is unchanged.
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureCanvasRenderCacheTarget(ownerState, cache, width, height);

  computeScene2DRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  const runtime = getCanvasRenderStateRuntime(cacheState);
  setCanvasRenderStateHandles(cacheState, target.canvas, target.context);
  cacheState.context.imageSmoothingEnabled = runtime.imageSmoothingEnabled;
  cacheState.context.imageSmoothingQuality = runtime.imageSmoothingQuality;
  setCanvasRenderTransform2D(cacheState, _renderTransform);

  const dirty = prepareScene2DRender(cacheState, source);
  if (dirty || resized) {
    cacheState.context.clearRect(0, 0, target.canvas.width, target.canvas.height);
    renderCanvasScene2D(cacheState, source);
  }
  return dirty || resized;
}

export function releaseCanvasRenderCache(state: CanvasRenderState, cache: RenderCache): void {
  const targets = _renderCacheTargets.get(state);
  const target = targets?.get(cache);
  if (target === undefined) return;
  destroyCanvasRenderTarget(target);
  targets!.delete(cache);
}

function drawCanvasRenderCache(state: RenderState, renderProxy: RenderProxy2D): void {
  const cache = getRenderProxyCache(state, renderProxy.source);
  if (cache === null) return;
  const canvasState = state as CanvasRenderState;
  const target = getTargets(canvasState).get(cache);
  if (target === undefined) return;
  // renderProxy.transform2D already carries the cache placement transform (folded in by the
  // adapter), so the cached canvas composites at the origin.
  setCanvasTransform(canvasState, canvasState.context, renderProxy.transform2D);
  canvasState.context.drawImage(target.canvas, 0, 0);
}

function getTargets(state: CanvasRenderState): Map<RenderCache, CanvasRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new Map();
    _renderCacheTargets.set(state, targets);
    registerCanvasRenderStateTeardown(state, destroyOwnedCanvasRenderCacheTargets);
  }
  return targets;
}

function destroyOwnedCanvasRenderCacheTargets(state: CanvasRenderState): void {
  const targets = _renderCacheTargets.get(state);
  if (targets === undefined) return;
  for (const target of targets.values()) destroyCanvasRenderTarget(target);
  targets.clear();
  _renderCacheTargets.delete(state);
}

export const defaultCanvasRenderCacheRenderer: Scene2DRenderer = {
  createData: noopRendererData,
  submit: drawCanvasRenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<CanvasRenderState, Map<RenderCache, CanvasRenderTarget>>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
const _targetSize = { width: 0, height: 0 };
