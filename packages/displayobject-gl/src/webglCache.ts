import { createMatrix, createRectangle } from '@flighthq/geometry';
import { computeNodeBoundsRectangle } from '@flighthq/node';
import {
  computeDisplayObjectRenderTargetTransform,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyAllRenderersFromRenderState,
  createRenderState,
  getRenderProxyCache,
  noopRendererData,
  prepareDisplayObjectRender,
  registerRenderCacheRenderer,
} from '@flighthq/render';
import { createGlRenderStateRuntime, getGlRenderStateRuntime } from '@flighthq/render-gl';
import {
  beginGlRenderTarget,
  createGlRenderTarget,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
  endGlRenderTarget,
  resizeGlRenderTarget,
} from '@flighthq/render-gl';
import type {
  DisplayObject,
  DisplayObjectRenderer,
  GlRenderState,
  GlRenderTarget,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { renderGlDisplayObject } from './webglDisplayObject';
import { flushGlSpriteBatch } from './webglSpriteBatch';

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
  const screenRuntime = getGlRenderStateRuntime(screenState);
  const cacheState = createRenderState({
    allowSmoothing: screenState.allowSmoothing,
    pixelRatio: screenState.pixelRatio,
    renderTransform2D: createMatrix(),
    roundPixels: screenState.roundPixels,
    sceneGraphSyncPolicy: screenState.sceneGraphSyncPolicy,
  }) as GlRenderState;

  // Attach the cache runtime before copying renderers: copyAllRenderersFromRenderState registers
  // into the runtime's rendererMap, so the backend runtime must already be installed.
  const cacheRuntime = createGlRenderStateRuntime();
  cacheState[EntityRuntimeKey] = cacheRuntime;

  copyAllRenderersFromRenderState(cacheState, screenState);

  cacheState.applyBlendMode = screenState.applyBlendMode;
  (cacheState as { canvas: HTMLCanvasElement }).canvas = screenState.canvas;
  (cacheState as { gl: WebGL2RenderingContext }).gl = screenState.gl;
  cacheRuntime.defaultBitmapShader = screenRuntime.defaultBitmapShader;
  cacheRuntime.colorTransformBitmapShader = screenRuntime.colorTransformBitmapShader;
  cacheRuntime.particleShader = screenRuntime.particleShader;
  cacheRuntime.particleCornerBuffer = screenRuntime.particleCornerBuffer;
  cacheRuntime.particleInstanceBuffer = screenRuntime.particleInstanceBuffer;
  cacheRuntime.particleInstanceData = screenRuntime.particleInstanceData;
  cacheRuntime.quadBatchShader = screenRuntime.quadBatchShader;
  cacheRuntime.quadBatchCornerBuffer = screenRuntime.quadBatchCornerBuffer;
  cacheRuntime.colorTransformInstancedShader = screenRuntime.colorTransformInstancedShader;
  cacheRuntime.uniformColorTransformShader = screenRuntime.uniformColorTransformShader;
  cacheRuntime.materialRendererMap = screenRuntime.materialRendererMap;
  cacheRuntime.materialBitmapShaderMap = screenRuntime.materialBitmapShaderMap;
  cacheRuntime.shaderLoc = screenRuntime.shaderLoc;
  cacheRuntime.textureCache = screenRuntime.textureCache;
  cacheRuntime.quadVertexBuffer = screenRuntime.quadVertexBuffer;
  cacheRuntime.quadIndexBuffer = screenRuntime.quadIndexBuffer;
  cacheRuntime.quadVertexData = screenRuntime.quadVertexData;
  cacheRuntime.matrixArray = screenRuntime.matrixArray;

  cacheRuntime.currentBlendMode = null;
  cacheRuntime.currentFramebuffer = null;
  cacheRuntime.currentMaskDepth = 0;
  cacheRuntime.currentProgram = null;
  cacheRuntime.currentScissorRect = null;
  cacheRuntime.currentTexture = null;
  cacheRuntime.renderTargetViewport = null;
  cacheRuntime.scissorStack = [];
  cacheRuntime.spriteBatchBlendMode = null;
  cacheRuntime.spriteBatchMaterial = null;
  cacheRuntime.spriteBatchMaterialRenderer = null;
  cacheRuntime.spriteBatchMaterialFloats = 0;
  cacheRuntime.spriteBatchMaterialData = new Float32Array(0);
  cacheRuntime.spriteBatchMaterialBuffer = null;
  cacheRuntime.spriteBatchCount = 0;
  cacheRuntime.spriteBatchInstanceBuffer = null;
  cacheRuntime.spriteBatchInstanceData = new Float32Array(0);
  cacheRuntime.spriteBatchTexture = null;

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

export function getGlRenderCacheTarget(state: GlRenderState, cache: RenderCache): GlRenderTarget | null {
  return getTargets(state).get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then records
 * the transform that places the result back in scene space. Returns whether a bake happened —
 * the offscreen state's own dirtiness decides it (honoring its sceneGraphSyncPolicy), so this is
 * cheap to call every frame. Because the bake runs on the shared GL context, the screen state's
 * cached GL state is reset afterward so it re-establishes cleanly on its next draw.
 */
export function refreshGlRenderCache(
  cacheState: GlRenderState,
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

  const existing = getGlRenderCacheTarget(screenState, cache);
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureGlRenderCacheTarget(screenState, cache, width, height);

  computeDisplayObjectRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  beginGlRenderTarget(cacheState, target, _renderTransform);
  const dirty = prepareDisplayObjectRender(cacheState, source);
  if (dirty || resized) {
    const cacheRuntime = getGlRenderStateRuntime(cacheState);
    // The cache state shares the screen's GL context, so the actual GL program/blend/scissor are
    // whatever the screen render (or a prior blur pass) last left — state this cache state does not
    // track. Reset its cached GL state so the bake re-establishes everything instead of skipping a
    // rebind and setting uniforms on the wrong program.
    cacheRuntime.currentProgram = null;
    cacheRuntime.currentTexture = null;
    cacheRuntime.currentBlendMode = null;
    cacheRuntime.currentScissorRect = null;
    cacheState.gl.clearColor(0, 0, 0, 0);
    cacheState.gl.clear(cacheState.gl.COLOR_BUFFER_BIT);
    renderGlDisplayObject(cacheState, source);
  }
  endGlRenderTarget(cacheState);

  const screenRuntime = getGlRenderStateRuntime(screenState);
  screenRuntime.currentBlendMode = null;
  screenRuntime.currentProgram = null;
  screenRuntime.currentScissorRect = null;
  screenRuntime.currentTexture = null;
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
  // immediate-draw renderer (RichText, Video, Scale9), this bypasses the sprite batch; without the
  // flush the cached result draws ahead of geometry submitted earlier in the walk, which only
  // flushes at the end — producing out-of-order replay (a doubled image on Gl).
  flushGlSpriteBatch(state);
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

export const defaultGlRenderCacheRenderer: DisplayObjectRenderer = {
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
