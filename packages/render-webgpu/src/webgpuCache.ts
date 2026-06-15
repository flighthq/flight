import { createMatrix, createRectangle, multiplyMatrix } from '@flighthq/geometry';
import { computeNodeBoundsRectangle } from '@flighthq/node';
import {
  computeDisplayObjectRenderTargetTransform,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyAllRenderersFromRenderState,
  createRenderState,
  getRenderNodeCache,
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
  WebGPURenderState,
  WebGPURenderTarget,
} from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { renderWebGPUDisplayObject } from './webgpuDisplayObject';
import {
  beginWebGPURenderTarget,
  createWebGPURenderTarget,
  destroyWebGPURenderTarget,
  drawWebGPURenderTargetResult,
  endWebGPURenderTarget,
  resizeWebGPURenderTarget,
} from './webgpuRenderTarget';

/**
 * Creates an offscreen render state for baking render caches consumed by `screenState`.
 *
 * WebGPU textures and pipelines cannot cross GPU devices, so — unlike the canvas backend —
 * this offscreen state must share the screen state's GPU device/context and every
 * device-bound resource (pipelines, samplers, uniform ring buffer, the uploaded-texture
 * cache). What it keeps separate is the scene-graph bookkeeping: its own render node map,
 * adapter map, and frame counter, so baking neither substitutes a cache into itself nor
 * disturbs the screen state's nodes.
 */
export function createWebGPUCacheState(screenState: WebGPURenderState): WebGPURenderState {
  const screen = screenState as WebGPURenderStateInternal;
  const cacheState = createRenderState({
    allowSmoothing: screenState.allowSmoothing,
    pixelRatio: screenState.pixelRatio,
    renderTransform2D: createMatrix(),
    roundPixels: screenState.roundPixels,
    sceneGraphSyncPolicy: screenState.sceneGraphSyncPolicy,
  }) as WebGPURenderStateInternal;

  copyAllRenderersFromRenderState(cacheState, screenState);
  cacheState.appearanceHooks = screenState.appearanceHooks;

  cacheState.applyBlendMode = screen.applyBlendMode;
  cacheState.canvas = screen.canvas;
  cacheState.context = screen.context;
  cacheState.device = screen.device;
  cacheState.format = screen.format;
  cacheState.uniformBindGroupLayout = screen.uniformBindGroupLayout;
  cacheState.textureBindGroupLayout = screen.textureBindGroupLayout;
  cacheState.uniformBuffer = screen.uniformBuffer;
  cacheState.uniformData = screen.uniformData;
  cacheState.uniformDataU32 = screen.uniformDataU32;
  cacheState.uniformStride = screen.uniformStride;
  cacheState.uniformBindGroup = screen.uniformBindGroup;
  cacheState.matrixArray = screen.matrixArray;
  cacheState.pipelineCache = screen.pipelineCache;
  cacheState.linearSampler = screen.linearSampler;
  cacheState.nearestSampler = screen.nearestSampler;
  cacheState.textureCache = screen.textureCache;
  cacheState.defaultBitmapShader = screen.defaultBitmapShader;
  cacheState.colorTransformBitmapShader = screen.colorTransformBitmapShader;
  cacheState.particleInstanceBuffer = screen.particleInstanceBuffer;
  cacheState.particleInstanceData = screen.particleInstanceData;
  cacheState.particleInstanceCapacity = screen.particleInstanceCapacity;
  cacheState.quadBatchInstanceBuffer = screen.quadBatchInstanceBuffer;
  cacheState.quadBatchInstanceData = screen.quadBatchInstanceData;
  cacheState.quadBatchInstanceCapacity = screen.quadBatchInstanceCapacity;

  // The baked subtree is recorded into the screen state's command encoder, so the cache
  // state must share the live per-frame encoder/pass surfaces rather than its own.
  cacheState.commandEncoder = screen.commandEncoder;
  cacheState.renderPass = screen.renderPass;
  cacheState.canvasTextureView = screen.canvasTextureView;
  cacheState.canvasViewCleared = screen.canvasViewCleared;
  cacheState.depthStencilTexture = screen.depthStencilTexture;
  cacheState.depthStencilView = screen.depthStencilView;
  cacheState.depthStencilWidth = screen.depthStencilWidth;
  cacheState.depthStencilHeight = screen.depthStencilHeight;

  cacheState.uniformOffset = 0;
  cacheState.currentBlendMode = null;
  cacheState.currentMaskDepth = 0;
  cacheState.maskWriteMode = false;
  cacheState.currentScissorRect = null;
  cacheState.scissorStack = [];
  cacheState.renderTargetViewport = null;
  cacheState.renderTargetStack = [];

  _cacheStateScreen.set(cacheState, screenState);
  return cacheState;
}

export function enableWebGPURenderCache(state: RenderState): void {
  registerRenderCacheRenderer(state, defaultWebGPURenderCacheRenderer);
}

/**
 * Allocates or resizes the texture `screenState` composites for `cache`, returning it so a
 * caller can render custom content into it directly. For engine-baked content prefer
 * refreshWebGPURenderCache.
 */
export function ensureWebGPURenderCacheTarget(
  state: WebGPURenderState,
  cache: RenderCache,
  width: number,
  height: number,
): WebGPURenderTarget {
  const targets = getTargets(state);
  let target = targets.get(cache);
  if (target === undefined) {
    target = createWebGPURenderTarget(state, width, height);
    targets.set(cache, target);
  } else {
    resizeWebGPURenderTarget(state, target, width, height);
  }
  return target;
}

export function getWebGPURenderCacheTarget(state: WebGPURenderState, cache: RenderCache): WebGPURenderTarget | null {
  return getTargets(state).get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then records
 * the transform that places the result back in scene space. Returns whether a bake happened —
 * the offscreen state's own dirtiness decides it (honoring its sceneGraphSyncPolicy), so this is
 * cheap to call every frame. Because the bake runs on the shared GPU device, the screen state's
 * cached GPU state is reset afterward so it re-establishes cleanly on its next draw.
 */
export function refreshWebGPURenderCache(
  cacheState: WebGPURenderState,
  cache: RenderCache,
  source: DisplayObject,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  const screenState = _cacheStateScreen.get(cacheState) ?? cacheState;
  const cs = cacheState as WebGPURenderStateInternal;
  const ss = screenState as WebGPURenderStateInternal;
  // The bake records into the screen state's live, per-frame command encoder and render pass.
  // createWebGPUCacheState captured those once at setup — stale now, since webgpu rebuilds them
  // every frame — so sync them here. This requires refresh to run within a frame (after the
  // encoder/pass have begun), unlike the immediate-mode WebGL backend.
  cs.commandEncoder = ss.commandEncoder;
  cs.renderPass = ss.renderPass;
  cs.canvasTextureView = ss.canvasTextureView;
  cs.canvasViewCleared = ss.canvasViewCleared;
  cs.depthStencilTexture = ss.depthStencilTexture;
  cs.depthStencilView = ss.depthStencilView;
  cs.depthStencilWidth = ss.depthStencilWidth;
  cs.depthStencilHeight = ss.depthStencilHeight;
  // The cache state shares the screen state's uniform ring buffer (createWebGPUCacheState aliases
  // uniformBuffer/uniformData). Continue from the screen's current cursor so the bake's draws claim
  // a region the screen render won't overwrite — otherwise both start at 0, the later screen writes
  // clobber the bake's uniforms, and the baked subtree draws with corrupted transforms.
  cs.uniformOffset = ss.uniformOffset;

  const padding = options?.padding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;

  computeNodeBoundsRectangle(_bounds, source, source);
  const { width, height } = computeRenderTargetSize(_bounds, padding, minWidth, minHeight);

  const existing = getWebGPURenderCacheTarget(screenState, cache);
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureWebGPURenderCacheTarget(screenState, cache, width, height);

  computeDisplayObjectRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  // WebGPU render targets store content for a bottom-left UV origin (what drawWebGPURenderTargetResult's
  // V-flip expects on composite), so bake with a Y-inverted render transform — unlike the WebGL backend,
  // whose framebuffer convention needs no inversion.
  _yInvert.d = -1;
  _yInvert.ty = target.height;
  multiplyMatrix(_bakeTransform, _yInvert, _renderTransform);

  beginWebGPURenderTarget(cacheState, target, _bakeTransform);
  const dirty = prepareDisplayObjectRender(cacheState, source);
  if (dirty || resized) {
    // The render-target pass begins with a 'clear' load op, so the target starts transparent.
    renderWebGPUDisplayObject(cacheState, source);
  }
  endWebGPURenderTarget(cacheState);

  // endWebGPURenderTarget reopened a fresh canvas pass on the cache state — hand the live encoder
  // and pass back to the screen state so its subsequent draws continue in the same frame.
  ss.commandEncoder = cs.commandEncoder;
  ss.renderPass = cs.renderPass;
  ss.canvasTextureView = cs.canvasTextureView;
  ss.canvasViewCleared = cs.canvasViewCleared;
  ss.currentBlendMode = null;
  // Advance the screen's cursor past the bake's uniform writes so its subsequent draws don't
  // overwrite them in the shared ring buffer.
  ss.uniformOffset = cs.uniformOffset;
  return dirty || resized;
}

export function releaseWebGPURenderCache(state: WebGPURenderState, cache: RenderCache): void {
  const targets = getTargets(state);
  const target = targets.get(cache);
  if (target === undefined) return;
  // A WebGPURenderTarget owns GPU textures; GC will not free them.
  destroyWebGPURenderTarget(state, target);
  targets.delete(cache);
}

function drawWebGPURenderCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const cache = getRenderNodeCache(state, renderNode.source);
  if (cache === null) return;
  const webgpuState = state as WebGPURenderState;
  const target = getTargets(webgpuState).get(cache);
  if (target === undefined) return;
  // renderNode.transform2D already carries the cache placement transform (folded in by the
  // adapter), so the target composites with an identity offset.
  drawWebGPURenderTargetResult(webgpuState, renderNode as never, target, _identity);
}

function getTargets(state: WebGPURenderState): WeakMap<RenderCache, WebGPURenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _renderCacheTargets.set(state, targets);
  }
  return targets;
}

export const defaultWebGPURenderCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  draw: drawWebGPURenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<WebGPURenderState, WeakMap<RenderCache, WebGPURenderTarget>>();
// Links an offscreen cache state back to the screen state whose targets it bakes into.
const _cacheStateScreen = new WeakMap<WebGPURenderState, WebGPURenderState>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
const _bakeTransform = createMatrix() as Matrix;
const _yInvert = createMatrix() as Matrix;
const _identity = createMatrix() as Matrix;
