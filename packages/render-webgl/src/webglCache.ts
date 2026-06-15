import { createMatrix, createRectangle } from '@flighthq/geometry';
import { computeNodeBoundsRectangle } from '@flighthq/node';
import {
  computeDisplayObjectRenderTargetTransform,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyAllRenderersFromRenderState,
  createRenderState,
  isRenderCache,
  noopRendererData,
  prepareDisplayObjectRender,
  registerRenderCacheRenderer,
} from '@flighthq/render';
import type {
  DisplayObject,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderState,
  WebGLRenderState,
  WebGLRenderTarget,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { renderWebGLDisplayObject } from './webglDisplayObject';
import {
  beginWebGLRenderTarget,
  createWebGLRenderTarget,
  destroyWebGLRenderTarget,
  drawWebGLRenderTargetResult,
  endWebGLRenderTarget,
  resizeWebGLRenderTarget,
} from './webglRenderTarget';

/**
 * Creates an offscreen render state for baking render caches consumed by `screenState`.
 *
 * WebGL textures and framebuffers cannot cross GL contexts, so — unlike the canvas backend —
 * this offscreen state must share the screen state's GL context and every context-bound
 * resource (shaders, buffers, the uploaded-texture cache). What it keeps separate is the
 * scene-graph bookkeeping: its own render node map, adapter map, and frame counter, so baking
 * neither substitutes a cache into itself nor disturbs the screen state's nodes.
 */
export function createWebGLCacheState(screenState: WebGLRenderState): WebGLRenderState {
  const screen = screenState as WebGLRenderStateInternal;
  const cacheState = createRenderState({
    allowSmoothing: screenState.allowSmoothing,
    pixelRatio: screenState.pixelRatio,
    renderTransform2D: createMatrix(),
    roundPixels: screenState.roundPixels,
    sceneGraphSyncPolicy: screenState.sceneGraphSyncPolicy,
  }) as WebGLRenderStateInternal;

  copyAllRenderersFromRenderState(cacheState, screenState);
  cacheState.appearanceHooks = screenState.appearanceHooks;

  cacheState.applyBlendMode = screen.applyBlendMode;
  cacheState.canvas = screen.canvas;
  cacheState.gl = screen.gl;
  cacheState.defaultBitmapShader = screen.defaultBitmapShader;
  cacheState.colorTransformBitmapShader = screen.colorTransformBitmapShader;
  cacheState.particleShader = screen.particleShader;
  cacheState.particleCornerBuffer = screen.particleCornerBuffer;
  cacheState.particleInstanceBuffer = screen.particleInstanceBuffer;
  cacheState.particleInstanceData = screen.particleInstanceData;
  cacheState.shaderLoc = screen.shaderLoc;
  cacheState.textureCache = screen.textureCache;
  cacheState.quadVertexBuffer = screen.quadVertexBuffer;
  cacheState.quadIndexBuffer = screen.quadIndexBuffer;
  cacheState.quadVertexData = screen.quadVertexData;
  cacheState.matrixArray = screen.matrixArray;

  cacheState.currentBlendMode = null;
  cacheState.currentFramebuffer = null;
  cacheState.currentMaskDepth = 0;
  cacheState.currentProgram = null;
  cacheState.currentScissorRect = null;
  cacheState.currentTexture = null;
  cacheState.renderTargetViewport = null;
  cacheState.scissorStack = [];

  _cacheStateScreen.set(cacheState, screenState);
  return cacheState;
}

export function enableWebGLRenderCache(state: RenderState): void {
  registerRenderCacheRenderer(state, defaultWebGLRenderCacheRenderer);
}

/**
 * Allocates or resizes the framebuffer-backed texture `screenState` composites for `cache`,
 * returning it so a caller can render custom content into it directly. For engine-baked
 * content prefer refreshWebGLRenderCache.
 */
export function ensureWebGLRenderCacheTarget(
  state: WebGLRenderState,
  cache: RenderCache,
  width: number,
  height: number,
): WebGLRenderTarget {
  const targets = getTargets(state);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createWebGLRenderTarget(state, width, height);
    targets.set(cache, target);
  } else {
    resizeWebGLRenderTarget(state, target, width, height);
  }
  return target;
}

export function getWebGLRenderCacheTarget(state: WebGLRenderState, cache: RenderCache): WebGLRenderTarget | null {
  return getTargets(state).get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then records
 * the transform that places the result back in scene space. Returns whether a bake happened —
 * the offscreen state's own dirtiness decides it (honoring its sceneGraphSyncPolicy), so this is
 * cheap to call every frame. Because the bake runs on the shared GL context, the screen state's
 * cached GL state is reset afterward so it re-establishes cleanly on its next draw.
 */
export function refreshWebGLRenderCache(
  cacheState: WebGLRenderState,
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

  const existing = getWebGLRenderCacheTarget(screenState, cache);
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureWebGLRenderCacheTarget(screenState, cache, width, height);

  computeDisplayObjectRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  beginWebGLRenderTarget(cacheState, target, _renderTransform);
  const dirty = prepareDisplayObjectRender(cacheState, source);
  if (dirty || resized) {
    const gl = (cacheState as WebGLRenderStateInternal).gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderWebGLDisplayObject(cacheState, source);
  }
  endWebGLRenderTarget(cacheState);

  const screen = screenState as WebGLRenderStateInternal;
  screen.currentBlendMode = null;
  screen.currentProgram = null;
  screen.currentScissorRect = null;
  screen.currentTexture = null;
  return dirty || resized;
}

export function releaseWebGLRenderCache(state: WebGLRenderState, cache: RenderCache): void {
  const targets = getTargets(state);
  const target = targets.get(cache);
  if (target === undefined) return;
  // A WebGLRenderTarget owns a framebuffer and texture; GC will not free them.
  destroyWebGLRenderTarget(state, target);
  targets.delete(cache);
}

function drawWebGLRenderCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source;
  if (!isRenderCache(source)) return;
  const webglState = state as WebGLRenderState;
  const target = getTargets(webglState).get(source);
  if (target === undefined) return;
  drawWebGLRenderTargetResult(webglState, renderNode, target, source.transform);
}

function getTargets(state: WebGLRenderState): WeakMap<RenderCache, WebGLRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _renderCacheTargets.set(state, targets);
  }
  return targets;
}

export const defaultWebGLRenderCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  draw: drawWebGLRenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<WebGLRenderState, WeakMap<RenderCache, WebGLRenderTarget>>();
// Links an offscreen cache state back to the screen state whose targets it bakes into.
const _cacheStateScreen = new WeakMap<WebGLRenderState, WebGLRenderState>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
