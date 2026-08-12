import { createMatrix, createRectangle, multiplyMatrix } from '@flighthq/geometry/contract';
import { computeNodeBoundsRectangle } from '@flighthq/node/contract';
import { createWgpuRenderStateRuntime, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import {
  beginWgpuFrame,
  beginWgpuRenderPass,
  createWgpuRenderTarget,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  endWgpuRenderPass,
  resizeWgpuRenderTarget,
  setWgpuRenderTransform2D,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';
import {
  computeScene2DRenderTargetTransform,
  computeRenderCacheTransform,
  computeRenderTargetSize,
  copyAllRenderersFromRenderState,
  createRenderState,
  getRenderProxyCache,
  noopRendererData,
  prepareScene2DRender,
  registerRenderCacheRenderer,
} from '@flighthq/render/contract';
import type {
  Node2D,
  Scene2DRenderer,
  Matrix,
  RenderCache,
  RenderCacheRefreshOptions,
  RenderProxy2D,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { renderWgpuScene2D } from './wgpuNode2D';
import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';

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

  // Attach the cache runtime before copying renderers: copyAllRenderersFromRenderState replaces the
  // runtime's renderer-table snapshot, so the backend runtime must already be installed.
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
  // Cache rendering is a derived pipeline: it starts from the screen's persistent registration
  // snapshots through a distinct aggregate, so later replacements on either state diverge cleanly.
  cacheRuntime.registries = {
    compressedTextureDecoder: screenRuntime.registries.compressedTextureDecoder,
    compressedTextureUpload: screenRuntime.registries.compressedTextureUpload,
    customMaterialShaders: screenRuntime.registries.customMaterialShaders,
    materialRenderers: screenRuntime.registries.materialRenderers,
    meshMaterialRenderers: screenRuntime.registries.meshMaterialRenderers,
    modifierSnippets: screenRuntime.registries.modifierSnippets,
    modifierSnippetRevision: screenRuntime.registries.modifierSnippetRevision,
    renderEffects: screenRuntime.registries.renderEffects,
    renderers: cacheRuntime.registries.renderers,
    shapeRasterizer: screenRuntime.registries.shapeRasterizer,
    strokeTessellator: screenRuntime.registries.strokeTessellator,
    textureResolvers: screenRuntime.registries.textureResolvers,
    velocityWriters: screenRuntime.registries.velocityWriters,
  };

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
  cacheRuntime.quadBatchWriterBlendMode = null;
  cacheRuntime.quadBatchWriterMaterial = null;
  cacheRuntime.quadBatchWriterMaterialRenderer = null;
  cacheRuntime.quadBatchWriterMaterialFloats = 0;
  cacheRuntime.quadBatchWriterCount = 0;
  cacheRuntime.quadBatchWriterInstanceData = new Float32Array(0);
  cacheRuntime.quadBatchWriterMaterialData = new Float32Array(0);
  cacheRuntime.quadBatchWriterTexture = null;
  cacheRuntime.quadBatchWriterSampler = null;
  cacheRuntime.quadBatchWriterSmoothing = null;
  // Propagate the opt-in color-adjustment fold + guard so tinted nodes inside a cached subtree fold the
  // same way when baked offscreen. Accumulation uses its independent base-runtime slot; per-batch CT
  // data lives on cacheRuntime and grows lazily.
  cacheRuntime.colorAdjustmentResolver = screenRuntime.colorAdjustmentResolver;
  cacheRuntime.wgpuColorAdjustmentMaterialFeature = screenRuntime.wgpuColorAdjustmentMaterialFeature;
  cacheRuntime.wgpuColorAdjustmentMaterialFeatureGuard = screenRuntime.wgpuColorAdjustmentMaterialFeatureGuard;
  // The bake state owns its own buffer pool (its flushes record into the same frame, so they must
  // not share slots with the screen's batch either).
  cacheRuntime.quadBatchWriterBufferPool = [];
  cacheRuntime.quadBatchWriterBufferCursor = 0;
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

// Cache rendering uses a second render state over the screen state's GPU device. Backend resources
// that must remain visible while that cache state walks a subtree are owned by the screen state.
export function getWgpuRenderCacheScreenState(state: WgpuRenderState): WgpuRenderState {
  return _cacheStateScreen.get(state) ?? state;
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
  source: Node2D,
  options?: Readonly<RenderCacheRefreshOptions>,
): boolean {
  const screenState = getWgpuRenderCacheScreenState(cacheState);
  const cacheRuntime = getWgpuRenderStateRuntime(cacheState);
  const screenRuntime = getWgpuRenderStateRuntime(screenState);
  const ownsFrame = screenRuntime.commandEncoder === null;
  if (ownsFrame) beginWgpuFrame(screenState);
  // The bake records into the screen state's live, per-frame command encoder and render pass.
  // createWgpuCacheState captured those once at setup — stale now, since webgpu rebuilds them every
  // frame — so sync them here. When no application frame is active, beginWgpuFrame gives this bake a
  // standalone encoder that is submitted below; callers may therefore refresh either inside or outside
  // their visible frame, matching the GL/cache API contract.
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

  computeScene2DRenderTargetTransform(_renderTransform, source, _bounds, padding, padding);
  computeRenderCacheTransform(cache.transform, _bounds, padding, padding);

  // Wgpu render targets store content for a bottom-left UV origin (what drawWgpuRenderTargetResult's
  // V-flip expects on composite), so bake with a Y-inverted render transform — unlike the Gl backend,
  // whose framebuffer convention needs no inversion.
  _yInvert.d = -1;
  _yInvert.ty = target.height;
  multiplyMatrix(_bakeTransform, _yInvert, _renderTransform);

  // Reclaim the bake state's buffer pool from the start of this bake; the previous bake's submit
  // has been queued, so its slots are safe to reuse.
  cacheRuntime.quadBatchWriterBufferCursor = 0;
  // The pass clears to transparent by default (target.clearColors is empty); the Y-inverted bake
  // transform is a display-object draw concern, set explicitly rather than carried by the pass.
  beginWgpuRenderPass(cacheState, target);
  setWgpuRenderTransform2D(cacheState, _bakeTransform);
  const dirty = prepareScene2DRender(cacheState, source);
  if (dirty || resized) {
    renderWgpuScene2D(cacheState, source);
  }
  endWgpuRenderPass(cacheState);

  // endWgpuRenderPass reopened a fresh canvas pass on the cache state — hand the live encoder
  // and pass back to the screen state so its subsequent draws continue in the same frame.
  screenRuntime.commandEncoder = cacheRuntime.commandEncoder;
  screenRuntime.renderPass = cacheRuntime.renderPass;
  screenRuntime.canvasTextureView = cacheRuntime.canvasTextureView;
  screenRuntime.canvasViewCleared = cacheRuntime.canvasViewCleared;
  screenRuntime.currentBlendMode = null;
  // Advance the screen's cursor past the bake's uniform writes so its subsequent draws don't
  // overwrite them in the shared ring buffer.
  screenRuntime.uniformOffset = cacheRuntime.uniformOffset;
  if (ownsFrame) submitWgpuRenderPass(screenState);
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
  // immediate-draw renderer (RichText), this bypasses the quad-batch writer; without the flush the
  // immediate quad interleaves with the un-flushed batch's instance buffer and bind-group state,
  // corrupting the pending batch rather than merely reordering it.
  flushWgpuQuadBatchWriter(state);
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

export const defaultWgpuRenderCacheRenderer: Scene2DRenderer = {
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
