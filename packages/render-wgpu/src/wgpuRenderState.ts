import { createMatrix } from '@flighthq/geometry';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  setRenderStateBackgroundColor,
} from '@flighthq/render';
import type { TextureWrap, WgpuRenderOptions, WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { warmWgpuPipelines } from './wgpuDraw';
import { createWgpuBindGroupLayouts, UNIFORM_BYTE_SIZE } from './wgpuShader';

// Ring buffer: 4096 draw slots per frame. Stride is clamped to at least 256 by the spec.
const RING_SLOT_COUNT = 4096;

export async function createWgpuRenderState(
  canvas: HTMLCanvasElement,
  options: WgpuRenderOptions = {},
): Promise<WgpuRenderState> {
  if (!navigator.gpu) throw new Error('WebGPU is not supported in this browser.');

  const adapter = await navigator.gpu.requestAdapter(
    options.powerPreference != null ? { powerPreference: options.powerPreference } : undefined,
  );
  if (!adapter) throw new Error('Failed to get WebGPU adapter.');

  // The forward-lit 3D pipeline binds 5 groups (Frame, Draw, Material, Shadow, Ibl); WebGPU's
  // guaranteed baseline maxBindGroups is only 4, so request 5 when the adapter allows it. Guarded by
  // the adapter limit: requiredLimits above the adapter's support makes requestDevice reject, and a
  // baseline-4 adapter simply keeps 4 (the 5-group lit pipeline is unavailable there until shadow+IBL
  // are folded into one group — a portability follow-up). 2D and unlit paths use ≤4 groups regardless.
  const requiredLimits: Record<string, number> = {};
  if (adapter.limits.maxBindGroups >= 5) requiredLimits.maxBindGroups = 5;
  // Compression features must be enabled at device creation; there is no later extension activation
  // like WebGL. Enable every family the adapter exposes so the opt-in compressed uploader can use the
  // native path when it is registered, while unsupported families retain their CPU decode fallback.
  const requiredFeatures = (
    ['texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'] as GPUFeatureName[]
  ).filter((feature) => adapter.features.has(feature));
  const deviceDescriptor: GPUDeviceDescriptor = {};
  if (Object.keys(requiredLimits).length > 0) deviceDescriptor.requiredLimits = requiredLimits;
  if (requiredFeatures.length > 0) deviceDescriptor.requiredFeatures = requiredFeatures;
  const device = await adapter.requestDevice(deviceDescriptor);

  const format = options.format ?? navigator.gpu.getPreferredCanvasFormat();

  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Failed to get WebGPU canvas context.');

  // COPY_SRC lets the canvas texture be read back via copyTextureToBuffer (createSurfaceFromWgpuRenderState).
  // It is the only reliable way to read a Wgpu frame in headless/software contexts, where canvas
  // presentation does not surface the swapchain; it also backs user-facing screenshot/save-pixels needs.
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  // Align uniform ring buffer slots to device limits
  const uniformStride = Math.max(256, device.limits.minUniformBufferOffsetAlignment, UNIFORM_BYTE_SIZE);
  const ringByteSize = uniformStride * RING_SLOT_COUNT;

  const uniformBuffer = device.createBuffer({
    size: ringByteSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformData = new Float32Array(ringByteSize / 4);
  const uniformDataU32 = new Uint32Array(uniformData.buffer);

  const { uniformBindGroupLayout, textureBindGroupLayout } = createWgpuBindGroupLayouts(device);

  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer, size: UNIFORM_BYTE_SIZE } }],
  });

  const linearSampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const nearestSampler = device.createSampler({
    minFilter: 'nearest',
    magFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
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
  (state as { canvas: HTMLCanvasElement }).canvas = canvas;
  (state as { context: GPUCanvasContext }).context = context;
  (state as { device: GPUDevice }).device = device;
  (state as { format: GPUTextureFormat }).format = format;

  const runtime = createWgpuRenderStateRuntime();
  state[EntityRuntimeKey] = runtime;
  runtime.currentBlendMode = null;

  runtime.uniformBindGroupLayout = uniformBindGroupLayout;
  runtime.textureBindGroupLayout = textureBindGroupLayout;
  runtime.uniformBuffer = uniformBuffer;
  runtime.uniformData = uniformData;
  runtime.uniformDataU32 = uniformDataU32;
  runtime.uniformOffset = 0;
  runtime.uniformStride = uniformStride;
  runtime.uniformBindGroup = uniformBindGroup;
  runtime.matrixArray = new Float32Array(9);

  runtime.pipelineCache = new Map();
  runtime.linearSampler = linearSampler;
  runtime.nearestSampler = nearestSampler;
  runtime.samplerCache = new Map();
  runtime.textureCache = new WeakMap();
  runtime.imageResourceTextureCache = new WeakMap();
  runtime.defaultBitmapShader = null;

  runtime.particleInstanceBuffer = null;
  runtime.particleInstanceData = null;
  runtime.particleInstanceCapacity = 0;

  runtime.spriteBatchBlendMode = null;
  runtime.spriteBatchMaterial = null;
  runtime.spriteBatchMaterialRenderer = null;
  runtime.spriteBatchMaterialFloats = 0;
  runtime.spriteBatchCount = 0;
  runtime.spriteBatchInstanceData = new Float32Array(13 * 256);
  runtime.spriteBatchMaterialData = new Float32Array(8 * 256);
  runtime.spriteBatchTexture = null;
  runtime.spriteBatchSmoothing = null;
  // Color-adjustment fold state (mode/data + the folded module) is not allocated here: it is owned by
  // the opt-in enableWgpuColorAdjustment, so a state that never tints carries none of it.
  runtime.spriteBatchBufferPool = [];
  runtime.spriteBatchBufferCursor = 0;

  runtime.commandEncoder = null;
  runtime.renderPass = null;
  runtime.canvasTextureView = null;
  runtime.canvasViewCleared = false;

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

// Allocates the package-private GPU runtime for a WgpuRenderState. createWgpuRenderState attaches
// one to each state under EntityRuntimeKey and populates its fields; getWgpuRenderStateRuntime reads
// it back. The render path writes the returned object every frame, so the return is intentionally
// mutable (not Readonly).
export function createWgpuRenderStateRuntime(): WgpuRenderStateRuntime {
  return createRenderStateRuntime() as WgpuRenderStateRuntime;
}

// Destroys the GPU buffers and textures createWgpuRenderState (and the lazy sprite-batch/particle
// paths) allocated on `state`: the uniform buffer, particle instance buffer, depth-stencil texture,
// and every sprite-batch pool slot's instance/material buffers. Call when the render state is no
// longer needed.
//
// Intentionally NOT touched: the GPUDevice (app-owned and shared — destroying it would tear down
// every state on it), and GC-managed Wgpu objects with no destroy() (pipelines, bind groups,
// layouts, samplers, shader modules, texture views). textureCache is a WeakMap and cannot be
// enumerated; its entries' textures are freed per-node by the dispose* paths.
export function destroyWgpuRenderState(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.uniformBuffer?.destroy();
  runtime.particleInstanceBuffer?.destroy();
  runtime.depthStencilTexture?.destroy();
  for (const slot of runtime.spriteBatchBufferPool) {
    slot.instanceBuffer?.destroy();
    slot.materialBuffer?.destroy();
  }
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
  filter: GPUFilterMode,
  wrapU: TextureWrap,
  wrapV: TextureWrap,
  mipmapFilter?: GPUMipmapFilterMode,
  maxAnisotropy = 1,
): GPUSampler {
  const runtime = getWgpuRenderStateRuntime(state);
  const anisotropy = Math.max(1, Math.floor(maxAnisotropy));
  const effectiveFilter: GPUFilterMode = anisotropy > 1 ? 'linear' : filter;
  const effectiveMipmapFilter = anisotropy > 1 ? 'linear' : mipmapFilter;
  // Pack the sampler config into a single NUMBER key rather than a template string — this runs on every
  // material bind (per frame), so a per-call string allocation would be hidden GC pressure in the hot
  // loop. filter (1 bit) | wrapU (2) | wrapV (2) | mipmap (2) | anisotropy (shifted above them).
  const key =
    SAMPLER_FILTER_BITS[effectiveFilter] |
    (SAMPLER_WRAP_BITS[wrapU] << 1) |
    (SAMPLER_WRAP_BITS[wrapV] << 3) |
    ((effectiveMipmapFilter === undefined ? 0 : SAMPLER_MIPMAP_BITS[effectiveMipmapFilter]) << 5) |
    (anisotropy << 7);
  let sampler = runtime.samplerCache.get(key);
  if (sampler === undefined) {
    const descriptor: GPUSamplerDescriptor = {
      minFilter: effectiveFilter,
      magFilter: effectiveFilter,
      addressModeU: wrapU,
      addressModeV: wrapV,
    };
    if (effectiveMipmapFilter !== undefined) descriptor.mipmapFilter = effectiveMipmapFilter;
    if (anisotropy > 1) descriptor.maxAnisotropy = anisotropy;
    sampler = state.device.createSampler(descriptor);
    runtime.samplerCache.set(key, sampler);
  }
  return sampler;
}

// Small-integer codes for the sampler-cache numeric key (see getWgpuSampler). Module-level so the key
// packing reads a field instead of allocating — no per-call table construction.
const SAMPLER_FILTER_BITS: Record<GPUFilterMode, number> = { nearest: 0, linear: 1 };
const SAMPLER_WRAP_BITS: Record<TextureWrap, number> = { 'clamp-to-edge': 0, 'mirror-repeat': 1, repeat: 2 };
const SAMPLER_MIPMAP_BITS: Record<GPUMipmapFilterMode, number> = { nearest: 1, linear: 2 };

export function isWgpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu !== null;
}
