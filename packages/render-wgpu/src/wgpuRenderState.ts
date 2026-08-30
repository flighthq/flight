import { createEntity } from '@flighthq/entity/contract';
import { createMatrix } from '@flighthq/geometry/contract';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  destroyRenderState,
  setRenderStateBackgroundColor,
} from '@flighthq/render/contract';
import type {
  TextureWrap,
  WgpuColorAdjustmentMaterialFeature,
  WgpuColorAdjustmentMaterialFeatureGuard,
  WgpuDeviceRuntime,
  WgpuDeviceState,
  WgpuHostAcquisition,
  WgpuHostAcquisitionOptions,
  WgpuHostBackend,
  WgpuPipeline,
  WgpuPresentationRenderState,
  WgpuRenderOptions,
  WgpuRenderState,
  WgpuRenderStateRuntime,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState } from '@flighthq/types/contract';

import { warmWgpuPipelines } from './wgpuDraw';
import { getWgpuHostBackend } from './wgpuHost';
import { createWgpuBindGroupLayouts, UNIFORM_BYTE_SIZE } from './wgpuShader';

// Ring buffer: 4096 draw slots per frame. Stride is clamped to at least 256 by the spec.
const RING_SLOT_COUNT = 4096;

// Acquires host handles the CALLER owns. Ownership is `caller`, so Flight never releases these: the caller
// ends their life with `releaseWgpuAcquisition`, and a state built on them leaves them intact when it is
// destroyed. Returns `null` rather than throwing, because "this environment has no WebGPU" is an expected
// outcome and not a programmer error.
export async function createWgpuAcquisitionFromCanvasElement(
  canvas: HTMLCanvasElement,
  options: Readonly<WgpuHostAcquisitionOptions> = {},
): Promise<WgpuHostAcquisition | null> {
  try {
    const acquired = await getWgpuHostBackend().acquire(canvas, options);
    return { ...acquired, ownership: 'caller' };
  } catch {
    return null;
  }
}

export function createWgpuDeviceState(device: GPUDevice): WgpuDeviceState {
  const deviceRuntime = createMinimalDeviceRuntime(device);
  const state = createEntity({ device }) as WgpuDeviceState;
  state[EntityRuntimeKey] = deviceRuntime;
  return state;
}

/**
 * Creates a device-only render state with its own frame-local resources.
 *
 * The state receives a fresh command encoder, uniform ring, traversal/proxy tree, batch writer, clip
 * stack, and render transform. Immutable pipelines/layouts/samplers plus uploaded textures and render
 * texture realizations share a device tier. Registrations are a creation-time snapshot.
 */
export function createWgpuOffscreenRenderState(
  deviceState: Readonly<WgpuDeviceState>,
  pipeline: Readonly<WgpuPipeline>,
  options: Readonly<WgpuRenderOptions> = {},
): WgpuRenderState {
  return initializeWgpuDeviceRenderState(deviceState, pipeline, options);
}

// Synchronous: with the handles already in hand there is nothing left to await. Everything asynchronous
// lives in acquisition.
export function createWgpuRenderState(
  acquisition: Readonly<WgpuHostAcquisition>,
  pipeline: Readonly<WgpuPipeline>,
  options: Readonly<WgpuRenderOptions> = {},
): WgpuPresentationRenderState {
  const hostBackend = getWgpuHostBackend();
  try {
    return initializeWgpuPresentationRenderState(options, acquisition, pipeline, hostBackend);
  } catch (error) {
    // ★ NEVER release what the caller owns, not even while unwinding a failure. This is the path where
    // borrowed handles were previously destroyed on the way out, and it was safe only because the shipped
    // backend happened to check. The policy belongs here, where it holds for every backend.
    if (acquisition.ownership !== 'caller') hostBackend.release(acquisition);
    throw error;
  }
}

// The canvas convenience: acquire, then build. The handles are `flight`-owned, so destroying the state
// releases them — the behavior every existing caller had when it passed a canvas.
export async function createWgpuRenderStateFromCanvasElement(
  canvas: HTMLCanvasElement,
  pipeline: Readonly<WgpuPipeline>,
  options: Readonly<WgpuRenderOptions & WgpuHostAcquisitionOptions> = {},
): Promise<WgpuPresentationRenderState> {
  const acquisition = await getWgpuHostBackend().acquire(canvas, {
    format: options.format,
    powerPreference: options.powerPreference,
  });
  return createWgpuRenderState(acquisition, pipeline, options);
}

export function createWgpuRenderStateRuntime(
  deviceState: Readonly<WgpuDeviceState>,
  pipeline: Readonly<WgpuPipeline>,
): WgpuRenderStateRuntime {
  return createWgpuRenderStateRuntimeInternal(getWgpuDeviceRuntime(deviceState), pipeline);
}

function initializeWgpuPresentationRenderState(
  options: Readonly<WgpuRenderOptions>,
  acquisition: Readonly<WgpuHostAcquisition>,
  pipeline: Readonly<WgpuPipeline>,
  hostBackend: WgpuHostBackend,
): WgpuPresentationRenderState {
  const { context, device, format } = acquisition;

  // COPY_SRC lets the canvas texture be read back via copyTextureToBuffer (createBitmapFromWgpuRenderState).
  // It is the only reliable way to read a Wgpu frame in headless/software contexts, where canvas
  // presentation does not surface the swapchain; it also backs user-facing screenshot/save-pixels needs.
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const deviceState = createWgpuDeviceState(device);
  const ownership: WgpuAcquisitionOwnership = { acquisition, hostBackend, references: 0 };
  _acquisitionByDeviceRuntime.set(getWgpuDeviceRuntime(deviceState), ownership);
  const state = initializeWgpuDeviceRenderState(deviceState, pipeline, { ...options, format });
  Object.assign(state, { context, surface: acquisition.surface });
  getWgpuRenderStateRuntime(state).surfaceAntialiasEnabled = options.antialias ?? false;
  return state as WgpuPresentationRenderState;
}

function initializeWgpuDeviceRenderState(
  deviceState: Readonly<WgpuDeviceState>,
  pipeline: Readonly<WgpuPipeline>,
  options: Readonly<WgpuRenderOptions>,
): WgpuRenderState {
  const device = deviceState.device;
  const format = options.format ?? 'bgra8unorm';
  const deviceRuntime = getWgpuDeviceRuntime(deviceState);
  initializeWgpuDeviceRuntime(deviceRuntime);

  const uniformStride = Math.max(256, device.limits.minUniformBufferOffsetAlignment, UNIFORM_BYTE_SIZE);
  const ringByteSize = uniformStride * RING_SLOT_COUNT;
  const uniformBuffer = device.createBuffer({
    size: ringByteSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformData = new Float32Array(ringByteSize / 4);
  const uniformBindGroup = device.createBindGroup({
    layout: deviceRuntime.uniformBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer, size: UNIFORM_BYTE_SIZE } }],
  });

  const state = _createRenderState({
    allowSmoothing: options.imageSmoothingEnabled ?? true,
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as WgpuRenderState;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  Object.assign(state, { deviceState, device, format, pipeline });

  const runtime = createWgpuRenderStateRuntime(deviceState, pipeline);
  state[EntityRuntimeKey] = runtime;

  runtime.surfaceAntialiasEnabled = false;
  runtime.currentBlendMode = null;
  runtime.currentRenderTarget = null;
  runtime.uniformBuffer = uniformBuffer;
  runtime.uniformData = uniformData;
  runtime.uniformDataU32 = new Uint32Array(uniformData.buffer);
  runtime.uniformOffset = 0;
  runtime.uniformStride = uniformStride;
  runtime.uniformBindGroup = uniformBindGroup;
  runtime.matrixArray = new Float32Array(9);
  runtime.mipmapDegradedGuard = null;
  runtime.mipmapGenerator = null;
  runtime.defaultBitmapShader = null;

  runtime.particleInstanceBuffer = null;
  runtime.particleInstanceData = null;
  runtime.particleInstanceCapacity = 0;

  runtime.quadBatchWriterBlendMode = null;
  runtime.quadBatchWriterMaterial = null;
  runtime.quadBatchWriterMaterialRenderer = null;
  runtime.quadBatchWriterMaterialFloats = 0;
  runtime.quadBatchWriterCount = 0;
  runtime.quadBatchWriterInstanceData = new Float32Array(13 * 256);
  runtime.quadBatchWriterMaterialData = new Float32Array(8 * 256);
  runtime.quadBatchWriterTexture = null;
  runtime.quadBatchWriterSampler = null;
  runtime.quadBatchWriterSmoothing = null;
  runtime.quadBatchWriterBufferPool = [];
  runtime.quadBatchWriterBufferCursor = 0;

  runtime.commandEncoder = null;
  runtime.renderPass = null;
  runtime.canvasTextureView = null;
  runtime.canvasViewCleared = false;
  runtime.frameCaptureEnabled = false;
  runtime.frameCaptureTexture = null;
  runtime.frameCaptureBuffer = null;
  runtime.frameCaptureBytesPerRow = 0;
  runtime.frameCaptureWidth = 0;
  runtime.frameCaptureHeight = 0;

  runtime.depthStencilTexture = null;
  runtime.depthStencilView = null;
  runtime.depthStencilWidth = 0;
  runtime.depthStencilHeight = 0;

  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.clipContourPipelines = undefined;
  runtime.clipContourStack = [];
  runtime.shapeMeshPipelines = undefined;
  runtime.clipForms = [];

  runtime.scissorStack = [];
  runtime.currentScissorRect = null;
  runtime.renderTargetViewport = null;
  runtime.renderTargetStack = [];

  warmWgpuPipelines(state);

  return state;
}

// Destroys the GPU buffers and textures createWgpuRenderState (and the lazy quad-batch writer/particle
// paths) allocated on `state`: the uniform buffer, particle instance buffer, depth-stencil texture,
// and every quad-batch writer pool slot's instance/material buffers. Call when the render state is no
// longer needed.
//
// GC-managed Wgpu objects with no destroy() (pipelines, bind groups, layouts, samplers, shader
// modules, texture views) are not touched. textureCache is a WeakMap and cannot be enumerated; its
// entries' textures are freed per-node by the dispose* paths. The shared device tier routes its
// acquisition through the originating host backend when its last state is destroyed.
export function destroyWgpuRenderState(state: WgpuRenderState): void {
  if (_destroyedStates.has(state)) return;
  _destroyedStates.add(state);
  const runtime = getWgpuRenderStateRuntime(state);
  for (const teardown of [...runtime.teardowns]) teardown(state);
  runtime.teardowns.length = 0;
  destroyRenderState(state);
  runtime.uniformBuffer?.destroy();
  runtime.particleInstanceBuffer?.destroy();
  runtime.depthStencilTexture?.destroy();
  runtime.surfaceAntialiasTexture?.destroy();
  for (const slot of runtime.quadBatchWriterBufferPool) {
    slot.instanceBuffer?.destroy();
    slot.materialBuffer?.destroy();
  }
  const ctx = runtime.context;
  ctx.references--;
  if (ctx.references === 0) {
    const device = ctx.device;
    for (const teardown of ctx.teardowns) teardown(device);
    ctx.teardowns.length = 0;
  }
  const ownership = _acquisitionByStateRuntime.get(runtime);
  if (ownership !== undefined) {
    ownership.references--;
    if (ownership.references === 0 && ownership.acquisition.ownership !== 'caller') {
      ownership.hostBackend.release(ownership.acquisition);
    }
  }
}

function createWgpuRenderStateRuntimeInternal(
  deviceRuntime: WgpuDeviceRuntime,
  pipeline: Readonly<WgpuPipeline>,
): WgpuRenderStateRuntime {
  const runtime = createRenderStateRuntime() as WgpuRenderStateRuntime;
  runtime.applyBlendModeParent = null;
  runtime.surfaceAntialiasEnabled = false;
  runtime.surfaceAntialiasTexture = null;
  runtime.surfaceAntialiasView = null;
  runtime.surfaceAntialiasWidth = 0;
  runtime.surfaceAntialiasHeight = 0;
  runtime.surfaceAntialiasResolveBindGroupLayout = null;
  runtime.surfaceAntialiasResolvePipeline = null;
  runtime.surfaceAntialiasResolveBindGroup = null;
  runtime.surfacePresentationView = null;
  runtime.registries = { ...pipeline.registries };
  runtime.teardowns = [];
  runtime.borrowedSurfaceExtent = null;
  const ownership = _acquisitionByDeviceRuntime.get(deviceRuntime);
  if (ownership !== undefined) {
    ownership.references++;
    _acquisitionByStateRuntime.set(runtime, ownership);
  }
  deviceRuntime.references++;
  runtime.context = deviceRuntime;
  return runtime;
}

export function getWgpuColorAdjustmentMaterialFeature(
  state: WgpuRenderState,
): Readonly<WgpuColorAdjustmentMaterialFeature> | null {
  const entry = getWgpuRenderStateRuntime(state).registries.colorAdjustmentFeature?.entry;
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

export function getWgpuColorAdjustmentMaterialFeatureGuard(
  state: WgpuRenderState,
): WgpuColorAdjustmentMaterialFeatureGuard | null {
  const entry = getWgpuRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard?.entry;
  return entry?.state === RegistryEntryState.Bound ? entry.value : null;
}

export function getWgpuDeviceRuntime(deviceState: Readonly<WgpuDeviceState>): WgpuDeviceRuntime {
  return deviceState[EntityRuntimeKey] as WgpuDeviceRuntime;
}

// Resolves the package-private GPU runtime attached to a WgpuRenderState. Mutable by design: the
// render path writes its fields every frame.
export function getWgpuRenderStateRuntime(state: WgpuRenderState): WgpuRenderStateRuntime {
  return state[EntityRuntimeKey] as WgpuRenderStateRuntime;
}

// Returns a cached GPUSampler for a filter + wrap + mip-filter + anisotropy combination, creating it on
// first use. A GPUSampler's address mode, mip filter, and anisotropy are all immutable, so a tiling or
// mipmapped material selects the matching sampler at bind-group creation rather than mutating the shared
// clamp sampler. TextureWrap values ('clamp-to-edge'/'repeat'/'mirror-repeat') are exactly the
// GPUAddressMode strings, so they pass through untranslated. mipmapFilter undefined means no mip
// sampling (the historical wrap-only behavior). WebGPU requires linear min/mag/mip filtering whenever
// maxAnisotropy > 1, so an anisotropy request forces all three to linear. The clamp-to-edge defaults
// keep their own pre-created linear/nearest samplers; this backs every non-default combination.
export function getWgpuSampler(
  state: WgpuRenderState,
  minFilter: GPUFilterMode,
  magFilter: GPUFilterMode,
  wrapU: TextureWrap,
  wrapV: TextureWrap,
  mipmapFilter?: GPUMipmapFilterMode,
  maxAnisotropy = 1,
): GPUSampler {
  const runtime = getWgpuRenderStateRuntime(state);
  const anisotropy = Math.max(1, Math.floor(maxAnisotropy));
  const effectiveMinFilter: GPUFilterMode = anisotropy > 1 ? 'linear' : minFilter;
  const effectiveMagFilter: GPUFilterMode = anisotropy > 1 ? 'linear' : magFilter;
  const effectiveMipmapFilter = anisotropy > 1 ? 'linear' : mipmapFilter;
  // Pack the sampler config into a single NUMBER key rather than a template string — this runs on every
  // material bind (per frame), so a per-call string allocation would be hidden GC pressure in the hot
  // loop. min (1 bit) | mag (1) | wrapU (2) | wrapV (2) | mipmap (2) | anisotropy above them.
  const key =
    SAMPLER_FILTER_BITS[effectiveMinFilter] |
    (SAMPLER_FILTER_BITS[effectiveMagFilter] << 1) |
    (SAMPLER_WRAP_BITS[wrapU] << 2) |
    (SAMPLER_WRAP_BITS[wrapV] << 4) |
    ((effectiveMipmapFilter === undefined ? 0 : SAMPLER_MIPMAP_BITS[effectiveMipmapFilter]) << 6) |
    (anisotropy << 8);
  const cache = runtime.context.samplerCache;
  let sampler = cache.get(key);
  if (sampler === undefined) {
    const descriptor: GPUSamplerDescriptor = {
      minFilter: effectiveMinFilter,
      magFilter: effectiveMagFilter,
      addressModeU: wrapU,
      addressModeV: wrapV,
    };
    if (effectiveMipmapFilter !== undefined) descriptor.mipmapFilter = effectiveMipmapFilter;
    if (anisotropy > 1) descriptor.maxAnisotropy = anisotropy;
    sampler = state.device.createSampler(descriptor);
    cache.set(key, sampler);
  }
  return sampler;
}

export function isWgpuSupported(): boolean {
  return getWgpuHostBackend().isSupported();
}

export function registerWgpuDeviceTeardown(state: WgpuRenderState, teardown: (device: GPUDevice) => void): void {
  getWgpuRenderStateRuntime(state).context.teardowns.push(teardown);
}

export function registerWgpuRenderStateTeardown(
  state: WgpuRenderState,
  teardown: (state: WgpuRenderState) => void,
): void {
  getWgpuRenderStateRuntime(state).teardowns.push(teardown);
}

// Small-integer codes for the sampler-cache numeric key (see getWgpuSampler). Module-level so the key
// packing reads a field instead of allocating — no per-call table construction.
const SAMPLER_FILTER_BITS: Record<GPUFilterMode, number> = { nearest: 0, linear: 1 };
const SAMPLER_WRAP_BITS: Record<TextureWrap, number> = { 'clamp-to-edge': 0, 'mirror-repeat': 1, repeat: 2 };
const SAMPLER_MIPMAP_BITS: Record<GPUMipmapFilterMode, number> = { nearest: 1, linear: 2 };

function initializeWgpuDeviceRuntime(runtime: WgpuDeviceRuntime): void {
  if ((runtime.uniformBindGroupLayout as GPUBindGroupLayout | null) !== null) return;
  const device = runtime.device;
  const { uniformBindGroupLayout, textureBindGroupLayout } = createWgpuBindGroupLayouts(device);
  runtime.uniformBindGroupLayout = uniformBindGroupLayout;
  runtime.textureBindGroupLayout = textureBindGroupLayout;
  runtime.pipelineCache = new Map();
  runtime.linearSampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  runtime.nearestSampler = device.createSampler({
    minFilter: 'nearest',
    magFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  runtime.samplerCache = new Map();
  runtime.mipmapPipelineCache = new Map();
  runtime.textureCache = new WeakMap();
  runtime.textureSourcePremultipliedTextureCache = new WeakMap();
  runtime.textureSourcePremultipliedSrgbTextureCache = new WeakMap();
  runtime.textureSourceStraightTextureCache = new WeakMap();
  runtime.textureSourceStraightSrgbTextureCache = new WeakMap();
}

type WgpuAcquisitionOwnership = {
  acquisition: Readonly<WgpuHostAcquisition>;
  hostBackend: WgpuHostBackend;
  references: number;
};

// The caller's own teardown for an acquisition they own. Unconditional by design: the caller is asking.
export function releaseWgpuAcquisition(acquisition: Readonly<WgpuHostAcquisition>): void {
  getWgpuHostBackend().release(acquisition);
}

function createMinimalDeviceRuntime(device: GPUDevice): WgpuDeviceRuntime {
  return {
    binding: null,
    device,
    references: 0,
    teardowns: [],
    uniformBindGroupLayout: null as unknown as GPUBindGroupLayout,
    textureBindGroupLayout: null as unknown as GPUBindGroupLayout,
    pipelineCache: new Map(),
    linearSampler: null as unknown as GPUSampler,
    nearestSampler: null as unknown as GPUSampler,
    samplerCache: new Map(),
    mipmapPipelineCache: new Map(),
    textureCache: new WeakMap(),
    textureSourcePremultipliedTextureCache: new WeakMap(),
    textureSourcePremultipliedSrgbTextureCache: new WeakMap(),
    textureSourceStraightTextureCache: new WeakMap(),
    textureSourceStraightSrgbTextureCache: new WeakMap(),
  };
}

const _acquisitionByStateRuntime = new WeakMap<WgpuRenderStateRuntime, WgpuAcquisitionOwnership>();
const _acquisitionByDeviceRuntime = new WeakMap<WgpuDeviceRuntime, WgpuAcquisitionOwnership>();
const _destroyedStates = new WeakSet<WgpuRenderState>();

// Resolve the blend hook at the draw seam rather than hiding derived-state delegation behind an
// entity accessor. A locally installed hook wins; otherwise walk toward the screen pipeline so
// support enabled after derivation is visible to long-lived offscreen and cache states.
export function resolveWgpuApplyBlendMode(state: WgpuRenderState): WgpuRenderState['applyBlendMode'] {
  let current = state;
  while (current.applyBlendMode === null) {
    const parent = getWgpuRenderStateRuntime(current).applyBlendModeParent;
    if (parent === null) return null;
    current = parent;
  }
  return current.applyBlendMode;
}
