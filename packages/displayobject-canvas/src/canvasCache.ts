import { createMatrix, createRectangle } from '@flighthq/geometry';
import { computeNodeBoundsRectangle } from '@flighthq/node';
import {
  computeDisplayObjectRenderTargetTransform,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyAllRenderersFromRenderState,
  getRenderProxyCache,
  noopRendererData,
  prepareDisplayObjectRender,
  registerRenderCacheRenderer,
} from '@flighthq/render';
import type {
  CanvasRenderState,
  CanvasRenderTarget,
  DisplayObject,
  DisplayObjectRenderer,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';

import { renderCanvasDisplayObject } from './canvasDisplayObject';
import { createCanvasRenderState, getCanvasRenderStateRuntime } from './canvasRenderState';
import { createCanvasRenderTarget, resizeCanvasRenderTarget, setCanvasRenderTransform2D } from './canvasRenderTarget';
import { setCanvasTransform } from './canvasTransform';

// Writable view of the readonly canvas/context handles. refreshCanvasRenderCache redirects the
// offscreen cache state's handles at the cache target, mirroring the redirection boundary in
// canvasRenderTarget.
type CanvasRenderStateHandles = CanvasRenderState & {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

/**
 * Creates a dedicated offscreen render state for baking render caches consumed by
 * `screenState`. It copies the screen state's renderers and propagates the settings that
 * affect rendering (pixel ratio, sync policy, rounding, smoothing, appearance hooks) so a
 * baked subtree looks the same offscreen as it would on screen — but keeps its own render
 * node map, adapter map, and frame counter, so baking never touches the screen state.
 */
export function createCanvasCacheState(screenState: CanvasRenderState): CanvasRenderState {
  const screen = getCanvasRenderStateRuntime(screenState);
  const cacheState = createCanvasRenderState(document.createElement('canvas'), {
    imageSmoothingEnabled: screen.imageSmoothingEnabled,
    imageSmoothingQuality: screen.imageSmoothingQuality,
    pixelRatio: screenState.pixelRatio,
    roundPixels: screenState.roundPixels,
    sceneGraphSyncPolicy: screenState.sceneGraphSyncPolicy,
  });
  copyAllRenderersFromRenderState(cacheState, screenState);
  _cacheStateScreen.set(cacheState, screenState);
  return cacheState;
}

export function destroyCanvasRenderCacheTarget(state: CanvasRenderState, cache: RenderCache): void {
  // Explicitly collapses the offscreen canvas backing this cache's render target so the browser
  // can reclaim its compositor/GPU memory immediately, rather than waiting for GC. After calling
  // this, the target is invalid. For a plain slot-release without destroying the backing store,
  // use releaseCanvasRenderCache instead.
  const targets = getTargets(state);
  const target = targets.get(cache);
  if (target !== undefined) {
    target.canvas.width = 0;
    target.canvas.height = 0;
    target.width = 0;
    target.height = 0;
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
    target = createCanvasRenderTarget(width, height);
    targets.set(cache, target);
  } else {
    resizeCanvasRenderTarget(target, width, height);
  }
  return target;
}

export function getCanvasRenderCacheTarget(state: CanvasRenderState, cache: RenderCache): CanvasRenderTarget | null {
  return getTargets(state).get(cache) ?? null;
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
  cacheState: CanvasRenderState,
  cache: RenderCache,
  source: DisplayObject,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  const screenState = _cacheStateScreen.get(cacheState) ?? cacheState;
  const padding = options?.padding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;

  computeNodeBoundsRectangle(_bounds, source, source);
  const { width, height } = computeRenderTargetSize(_bounds, padding, minWidth, minHeight);

  const existing = getCanvasRenderCacheTarget(screenState, cache);
  // A canvas resize clears its pixels, so a resized target must be redrawn even if the
  // subtree itself is unchanged.
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureCanvasRenderCacheTarget(screenState, cache, width, height);

  computeDisplayObjectRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  const handles = cacheState as CanvasRenderStateHandles;
  const runtime = getCanvasRenderStateRuntime(cacheState);
  handles.canvas = target.canvas;
  handles.context = target.context;
  handles.context.imageSmoothingEnabled = runtime.imageSmoothingEnabled;
  handles.context.imageSmoothingQuality = runtime.imageSmoothingQuality;
  setCanvasRenderTransform2D(cacheState, _renderTransform);

  const dirty = prepareDisplayObjectRender(cacheState, source);
  if (dirty || resized) {
    handles.context.clearRect(0, 0, target.canvas.width, target.canvas.height);
    renderCanvasDisplayObject(cacheState, source);
  }
  return dirty || resized;
}

export function releaseCanvasRenderCache(state: CanvasRenderState, cache: RenderCache): void {
  // A CanvasRenderTarget holds no GPU handle; dropping the reference is enough to free it.
  getTargets(state).delete(cache);
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

function getTargets(state: CanvasRenderState): WeakMap<RenderCache, CanvasRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _renderCacheTargets.set(state, targets);
  }
  return targets;
}

export const defaultCanvasRenderCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasRenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<CanvasRenderState, WeakMap<RenderCache, CanvasRenderTarget>>();
// Links an offscreen cache state back to the screen state whose targets it bakes into.
const _cacheStateScreen = new WeakMap<CanvasRenderState, CanvasRenderState>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
