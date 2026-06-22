import { createMatrix, createRectangle, multiplyMatrix } from '@flighthq/geometry';
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
import { createWgpuRenderStateRuntime, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import {
  beginWgpuRenderTarget,
  createWgpuRenderTarget,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  endWgpuRenderTarget,
  resizeWgpuRenderTarget,
} from '@flighthq/render-wgpu';
import type {
  DisplayObject,
  DisplayObjectRenderer,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { renderWgpuDisplayObject } from './wgpuDisplayObject';
import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';

/**
 * Creates an offscreen render state for baking render caches consumed by `screenState`.
 *
 * Wgpu textures and pipelines cannot cross GPU devices, so — unlike the canvas backend —
 * this offscreen state must share the screen state's GPU device/context and every
 * device-bound resource (pipelines, samplers, uniform ring buffer, the uploaded-texture
 * cache). What it keeps separate is the scene-graph bookkeeping: its own render node map,
 * adapter map, and frame counter, so baking neither substitutes a cache into itself nor
 * disturbs the screen state's nodes.
 */
export function createWgpuCacheState(screenState: WgpuRenderState): WgpuRenderState {
  const screenRuntime = getWgpuRenderStateRuntime(screenState);
  const cacheState = createRenderState({
    allowSmoothing: screenState.allowSmoothing,
    pixelRatio: screenState.pixelRatio,
    renderTransform2D: createMatrix(),
    roundPixels: screenState.roundPixels,
    sceneGraphSyncPolicy: screenState.sceneGraphSyncPolicy,
  }) as WgpuRenderState;

  // Attach the cache runtime before copying renderers: copyAllRenderersFromRenderState registers
  // into the runtime's rendererMap, so the backend runtime must already be installed.
  const cacheRuntime = createWgpuRenderStateRuntime();
  cacheState[EntityRuntimeKey] = cacheRuntime;

  copyAllRenderersFromRenderState(cacheState, screenState);

  cacheState.applyBlendMode = screenState.applyBlendMode;
  (cacheState as { canvas: HTMLCanvasElement }).canvas = screenState.canvas;
  (cacheState as { context: GPUCanvasContext }).context = screenState.context;
  (cacheState as { device: GPUDevice }).device = screenState.device;
  (cacheState as { format: GPUTextureFormat }).format = screenState.format;

  cacheRuntime.uniformBindGroupLayout = screenRuntime.uniformBindGroupLayout;
  cacheRuntime.textureBindGroupLayout = screenRuntime.textureBindGroupLayout;
  cacheRuntime.uniformBuffer = screenRuntime.uniformBuffer;
  cacheRuntime.uniformData = screenRuntime.uniformData;
  cacheRuntime.uniformDataU32 = screenRuntime.uniformDataU32;
  cacheRuntime.uniformStride = screenRuntime.uniformStride;
  cacheRuntime.uniformBindGroup = screenRuntime.uniformBindGroup;
  cacheRuntime.matrixArray = screenRuntime.matrixArray;
  cacheRuntime.pipelineCache = screenRuntime.pipelineCache;
  cacheRuntime.linearSampler = screenRuntime.linearSampler;
  cacheRuntime.nearestSampler = screenRuntime.nearestSampler;
  cacheRuntime.textureCache = screenRuntime.textureCache;
  cacheRuntime.defaultBitmapShader = screenRuntime.defaultBitmapShader;
  cacheRuntime.colorTransformBitmapShader = screenRuntime.colorTransformBitmapShader;
  cacheRuntime.particleInstanceBuffer = screenRuntime.particleInstanceBuffer;
  cacheRuntime.particleInstanceData = screenRuntime.particleInstanceData;
  cacheRuntime.particleInstanceCapacity = screenRuntime.particleInstanceCapacity;
  // The baked subtree is recorded into the screen state's command encoder, so the cache
  // state must share the live per-frame encoder/pass surfaces rather than its own.
  cacheRuntime.commandEncoder = screenRuntime.commandEncoder;
  cacheRuntime.renderPass = screenRuntime.renderPass;
  cacheRuntime.canvasTextureView = screenRuntime.canvasTextureView;
  cacheRuntime.canvasViewCleared = screenRuntime.canvasViewCleared;
  cacheRuntime.depthStencilTexture = screenRuntime.depthStencilTexture;
  cacheRuntime.depthStencilView = screenRuntime.depthStencilView;
  cacheRuntime.depthStencilWidth = screenRuntime.depthStencilWidth;
  cacheRuntime.depthStencilHeight = screenRuntime.depthStencilHeight;
  cacheRuntime.materialRendererMap = screenRuntime.materialRendererMap;

  cacheRuntime.uniformOffset = 0;
  cacheRuntime.currentBlendMode = null;
  cacheRuntime.currentMaskDepth = 0;
  // Contour-clip pipelines can be lazily rebuilt against the cache's device; the active-clip stack must
  // start empty so a cached subtree's clips don't reference the screen state's GPU buffers.
  cacheRuntime.clipContourPipelines = undefined;
  cacheRuntime.clipContourStack = [];
  cacheRuntime.clipForms = [];
  // The flat-color shape-fill pipelines can be lazily rebuilt against the (shared) device on first use.
  cacheRuntime.shapeMeshPipelines = undefined;
  cacheRuntime.spriteBatchBlendMode = null;
  cacheRuntime.spriteBatchMaterial = null;
  cacheRuntime.spriteBatchMaterialRenderer = null;
  cacheRuntime.spriteBatchMaterialFloats = 0;
  cacheRuntime.spriteBatchCount = 0;
  cacheRuntime.spriteBatchInstanceData = new Float32Array(0);
  cacheRuntime.spriteBatchMaterialData = new Float32Array(0);
  cacheRuntime.spriteBatchTexture = null;
  // The bake state owns its own buffer pool (its flushes record into the same frame, so they must
  // not share slots with the screen's batch either).
  cacheRuntime.spriteBatchBufferPool = [];
  cacheRuntime.spriteBatchBufferCursor = 0;
  cacheRuntime.maskWriteMode = false;
  cacheRuntime.currentScissorRect = null;
  cacheRuntime.scissorStack = [];
  cacheRuntime.renderTargetViewport = null;
  cacheRuntime.renderTargetStack = [];

  _cacheStateScreen.set(cacheState, screenState);
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
  return getTargets(state).get(cache) ?? null;
}

/**
 * Bakes `source`'s subtree into its cache target using the offscreen `cacheState`, then records
 * the transform that places the result back in scene space. Returns whether a bake happened —
 * the offscreen state's own dirtiness decides it (honoring its sceneGraphSyncPolicy), so this is
 * cheap to call every frame. Because the bake runs on the shared GPU device, the screen state's
 * cached GPU state is reset afterward so it re-establishes cleanly on its next draw.
 */
export function refreshWgpuRenderCache(
  cacheState: WgpuRenderState,
  cache: RenderCache,
  source: DisplayObject,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  const screenState = _cacheStateScreen.get(cacheState) ?? cacheState;
  const cacheRuntime = getWgpuRenderStateRuntime(cacheState);
  const screenRuntime = getWgpuRenderStateRuntime(screenState);
  // The bake records into the screen state's live, per-frame command encoder and render pass.
  // createWgpuCacheState captured those once at setup — stale now, since webgpu rebuilds them
  // every frame — so sync them here. This requires refresh to run within a frame (after the
  // encoder/pass have begun), unlike the immediate-mode Gl backend.
  cacheRuntime.commandEncoder = screenRuntime.commandEncoder;
  cacheRuntime.renderPass = screenRuntime.renderPass;
  cacheRuntime.canvasTextureView = screenRuntime.canvasTextureView;
  cacheRuntime.canvasViewCleared = screenRuntime.canvasViewCleared;
  cacheRuntime.depthStencilTexture = screenRuntime.depthStencilTexture;
  cacheRuntime.depthStencilView = screenRuntime.depthStencilView;
  cacheRuntime.depthStencilWidth = screenRuntime.depthStencilWidth;
  cacheRuntime.depthStencilHeight = screenRuntime.depthStencilHeight;
  // The cache state shares the screen state's uniform ring buffer (createWgpuCacheState aliases
  // uniformBuffer/uniformData). Continue from the screen's current cursor so the bake's draws claim
  // a region the screen render won't overwrite — otherwise both start at 0, the later screen writes
  // clobber the bake's uniforms, and the baked subtree draws with corrupted transforms.
  cacheRuntime.uniformOffset = screenRuntime.uniformOffset;

  const padding = options?.padding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;

  computeNodeBoundsRectangle(_bounds, source, source);
  const { width, height } = computeRenderTargetSize(_bounds, padding, minWidth, minHeight);

  const existing = getWgpuRenderCacheTarget(screenState, cache);
  const resized = existing === null || existing.width !== width || existing.height !== height;
  const target = ensureWgpuRenderCacheTarget(screenState, cache, width, height);

  computeDisplayObjectRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  // Wgpu render targets store content for a bottom-left UV origin (what drawWgpuRenderTargetResult's
  // V-flip expects on composite), so bake with a Y-inverted render transform — unlike the Gl backend,
  // whose framebuffer convention needs no inversion.
  _yInvert.d = -1;
  _yInvert.ty = target.height;
  multiplyMatrix(_bakeTransform, _yInvert, _renderTransform);

  // Reclaim the bake state's buffer pool from the start of this bake; the previous bake's submit
  // has been queued, so its slots are safe to reuse.
  cacheRuntime.spriteBatchBufferCursor = 0;
  beginWgpuRenderTarget(cacheState, target, _bakeTransform);
  const dirty = prepareDisplayObjectRender(cacheState, source);
  if (dirty || resized) {
    // The render-target pass begins with a 'clear' load op, so the target starts transparent.
    renderWgpuDisplayObject(cacheState, source);
  }
  endWgpuRenderTarget(cacheState);

  // endWgpuRenderTarget reopened a fresh canvas pass on the cache state — hand the live encoder
  // and pass back to the screen state so its subsequent draws continue in the same frame.
  screenRuntime.commandEncoder = cacheRuntime.commandEncoder;
  screenRuntime.renderPass = cacheRuntime.renderPass;
  screenRuntime.canvasTextureView = cacheRuntime.canvasTextureView;
  screenRuntime.canvasViewCleared = cacheRuntime.canvasViewCleared;
  screenRuntime.currentBlendMode = null;
  // Advance the screen's cursor past the bake's uniform writes so its subsequent draws don't
  // overwrite them in the shared ring buffer.
  screenRuntime.uniformOffset = cacheRuntime.uniformOffset;
  return dirty || resized;
}

export function releaseWgpuRenderCache(state: WgpuRenderState, cache: RenderCache): void {
  const targets = getTargets(state);
  const target = targets.get(cache);
  if (target === undefined) return;
  // A WgpuRenderTarget owns GPU textures; GC will not free them.
  destroyWgpuRenderTarget(state, target);
  targets.delete(cache);
}

function drawWgpuRenderCache(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const cache = getRenderProxyCache(state, renderProxy.source);
  if (cache === null) return;
  const target = getTargets(state).get(cache);
  if (target === undefined) return;
  // Drain pending batched geometry before the immediate composite quad. Like every other
  // immediate-draw renderer (RichText, Video), this bypasses the sprite batch; without the flush the
  // immediate quad interleaves with the un-flushed batch's instance buffer and bind-group state,
  // corrupting the pending batch rather than merely reordering it.
  flushWgpuSpriteBatch(state);
  // renderProxy.transform2D already carries the cache placement transform (folded in by the
  // adapter), so the target composites with an identity offset.
  drawWgpuRenderTargetResult(state, renderProxy, target, _identity);
}

function getTargets(state: WgpuRenderState): WeakMap<RenderCache, WgpuRenderTarget> {
  let targets = _renderCacheTargets.get(state);
  if (targets === undefined) {
    targets = new WeakMap();
    _renderCacheTargets.set(state, targets);
  }
  return targets;
}

export const defaultWgpuRenderCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWgpuRenderCache,
};

// The screen state owns each cache's target, keyed by the handle, so one handle can be
// composited by several states without the handle carrying a backend resource.
const _renderCacheTargets = new WeakMap<WgpuRenderState, WeakMap<RenderCache, WgpuRenderTarget>>();
// Links an offscreen cache state back to the screen state whose targets it bakes into.
const _cacheStateScreen = new WeakMap<WgpuRenderState, WgpuRenderState>();
const _bounds = createRectangle();
const _renderTransform = createMatrix() as Matrix;
const _bakeTransform = createMatrix() as Matrix;
const _yInvert = createMatrix() as Matrix;
const _identity = createMatrix() as Matrix;
