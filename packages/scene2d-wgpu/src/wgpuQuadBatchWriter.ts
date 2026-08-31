import {
  getWgpuBlendState,
  getWgpuSampler,
  resolveWgpuApplyBlendMode,
  resolveWgpuSmoothingBindGroup,
} from '@flighthq/render-wgpu/contract';
import { getWgpuColorAdjustmentMaterialFeature } from '@flighthq/render-wgpu/contract';
import { getWgpuColorAdjustmentMaterialFeatureGuard } from '@flighthq/render-wgpu/contract';
import {
  getWgpuRenderStateDeviceResources,
  getWgpuRenderStateRuntime,
  getWgpuSurfaceRenderExtent,
} from '@flighthq/render-wgpu/contract';
import type {
  ColorScaleBias,
  TintMaterialData,
  Material,
  MaterialData,
  SamplerLike,
  WgpuMaterialRenderer,
  WgpuQuadBatchResources,
  WgpuRenderState,
  WgpuTextureEntry,
  WgpuQuadBatchWriterBufferSlot,
} from '@flighthq/types/contract';
import type { BlendMode } from '@flighthq/types/contract';

// Base per-instance layout (13 floats = 52 bytes). This is a fixed contract material shaders read
// from the instance storage buffer; it carries no material concern (no color adjustment). A material
// that needs per-instance data writes it into a parallel material storage buffer instead.
// [0-3]   a, b, c, d   — world-space 2D matrix
// [4-5]   tx, ty       — world-space translation
// [6-7]   width, height — region size in pixels
// [8-11]  u0,v0,u1,v1  — atlas UV rect
// [12]    alpha        — per-instance alpha
export const QUAD_BATCH_INSTANCE_FLOATS = 13;
const QUAD_BATCH_INSTANCE_STRIDE = QUAD_BATCH_INSTANCE_FLOATS * 4;

// Shared WGSL prelude for quad-batch writer material shaders: the base Uniforms and InstanceData structs,
// the standard bind-group bindings (@group(0) uniform, @group(1) texture/sampler, @group(2)
// instances), and a quadBaseVertex helper that expands one instance corner into clip-space position,
// UV, and alpha. A material module appends its own @group(3) material buffer (when it uses one), a
// VertexOut struct, vs_main, and fs_main. The base path knows nothing about what a material does
// with this — color adjustment and any other effect live entirely in the material's own module.
const QUAD_BATCH_PRELUDE_WGSL = /* wgsl */ `
struct Uniforms {
  matrix : mat3x3f,
  straightTextureAlpha : u32,
}

struct InstanceData {
  a : f32, b : f32, c : f32, d : f32,
  tx : f32, ty : f32,
  width : f32, height : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
  alpha : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var<storage, read> instances : array<InstanceData>;

struct BaseVertex {
  position : vec4f,
  uv : vec2f,
  alpha : f32,
}

fn quadBaseVertex(vi : u32, ii : u32) -> BaseVertex {
  let inst = instances[ii];
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let lx = select(0.0, inst.width, xi);
  let ly = select(0.0, inst.height, yi);
  let wx = inst.a * lx + inst.c * ly + inst.tx;
  let wy = inst.b * lx + inst.d * ly + inst.ty;
  let p = uni.matrix * vec3f(wx, wy, 1.0);
  var bv : BaseVertex;
  bv.position = vec4f(p.x, p.y, 0.0, 1.0);
  bv.uv = vec2f(select(inst.u0, inst.u1, xi), select(inst.v0, inst.v1, yi));
  bv.alpha = inst.alpha;
  return bv;
}
`;

export function ensureWgpuQuadBatchResources(state: WgpuRenderState): WgpuQuadBatchResources {
  const runtime = getWgpuRenderStateRuntime(state);
  const ctx = runtime.context;
  const existing = ctx.quadBatchResources;
  if (existing !== undefined) return existing;

  const { device } = state;
  const { uniformBindGroupLayout, textureBindGroupLayout } = getWgpuRenderStateDeviceResources(state);

  const instanceBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
  });

  // Generic per-instance material buffer (array<f32>); the same layout serves every material that
  // appends per-instance data, so the batch — not the material — owns it.
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
  });

  const basePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout, textureBindGroupLayout, instanceBindGroupLayout],
  });

  const materialPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [
      uniformBindGroupLayout,
      textureBindGroupLayout,
      instanceBindGroupLayout,
      materialBindGroupLayout,
    ],
  });

  const resources: WgpuQuadBatchResources = {
    instanceBindGroupLayout,
    materialBindGroupLayout,
    basePipelineLayout,
    materialPipelineLayout,
    pipelines: new WeakMap(),
  };
  ctx.quadBatchResources = resources;
  return resources;
}

export function flushWgpuQuadBatchWriter(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const count = runtime.quadBatchWriterCount;
  if (count === 0 || runtime.renderPass === null) {
    resetWgpuQuadBatchWriter(state);
    return;
  }

  const texture = runtime.quadBatchWriterTexture!;
  const sampler = runtime.quadBatchWriterSampler;
  const blendMode = runtime.quadBatchWriterBlendMode;
  const smoothing = runtime.quadBatchWriterSmoothing;
  const renderer = runtime.quadBatchWriterMaterialRenderer!;
  // The color-adjustment fold is opt-in (registerWgpuColorAdjustmentMaterialFeature): when installed it resolves a
  // tinted batch to its per-instance @group(3) storage data + folded module; an untinted batch (or an
  // un-enabled state) falls back to the resolved material's own per-instance data, and no fold WGSL is
  // linked into this module. CT and material per-instance data never mix in a built-in batch (built-in
  // materials have no per-instance floats).
  const ctFlush = getWgpuColorAdjustmentMaterialFeature(state)?.resolveFlush(state, count) ?? null;
  const group3Floats = ctFlush !== null ? ctFlush.floats : runtime.quadBatchWriterMaterialFloats;
  const group3Data = ctFlush !== null ? ctFlush.data : runtime.quadBatchWriterMaterialData;
  resetWgpuQuadBatchWriter(state);

  const resources = ensureWgpuQuadBatchResources(state);

  // Claim a distinct pool slot for this flush. The canvas pass is submitted once at end of frame, so
  // a buffer shared across flushes would be rewritten before any draw reads it, leaving every draw
  // reading the last flush's data. A per-flush slot keeps each draw's instances intact until submit.
  const slot = acquireWgpuQuadBatchWriterBufferSlot(state);

  const instanceBytes = count * QUAD_BATCH_INSTANCE_STRIDE;
  if (slot.instanceBuffer === null || slot.instanceCapacity < instanceBytes) {
    const capacity = Math.max(instanceBytes, slot.instanceCapacity * 2, QUAD_BATCH_INSTANCE_STRIDE * 256);
    slot.instanceBuffer = createWgpuQuadBatchWriterBuffer(state, capacity);
    slot.instanceCapacity = capacity;
  }
  state.device.queue.writeBuffer(slot.instanceBuffer, 0, runtime.quadBatchWriterInstanceData.buffer, 0, instanceBytes);

  if (group3Floats > 0) {
    const group3Bytes = count * group3Floats * 4;
    if (slot.materialBuffer === null || slot.materialCapacity < group3Bytes) {
      const capacity = Math.max(group3Bytes, slot.materialCapacity * 2, group3Floats * 4 * 256);
      slot.materialBuffer = createWgpuQuadBatchWriterBuffer(state, capacity);
      slot.materialCapacity = capacity;
    }
    state.device.queue.writeBuffer(slot.materialBuffer, 0, group3Data.buffer, 0, group3Bytes);
  }

  resolveWgpuApplyBlendMode(state)?.(state, blendMode);
  const textureBindGroup =
    sampler !== null
      ? createWgpuTextureSamplerBindGroup(state, texture.view, sampler)
      : resolveWgpuSmoothingBindGroup(state, texture, smoothing);

  const uniformOffset = writeWgpuQuadBatchWriterUniforms(state, texture.straightAlpha === true);

  const instanceBindGroup = state.device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: slot.instanceBuffer } }],
  });

  const module = ctFlush !== null ? ctFlush.module : renderer.getShaderModule(state);
  const pipeline = getWgpuQuadBatchPipeline(state, resources, module, group3Floats > 0, blendMode);
  const pass = runtime.renderPass!;
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, runtime.uniformBindGroup, [uniformOffset]);
  // Per-bitmap smoothing selects the LINEAR/NEAREST variant bind group; a null key (sprites/text/shapes)
  // uses the entry's global-default bind group.
  pass.setBindGroup(1, textureBindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  if (group3Floats > 0) {
    const materialBindGroup = state.device.createBindGroup({
      layout: resources.materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: slot.materialBuffer! } }],
    });
    pass.setBindGroup(3, materialBindGroup);
  }
  if (runtime.currentMaskDepth > 0) pass.setStencilReference(runtime.currentMaskDepth);
  pass.draw(6, count, 0, 0);
}

export function getWgpuQuadBatchPipeline(
  state: WgpuRenderState,
  resources: WgpuQuadBatchResources,
  module: GPUShaderModule,
  hasMaterialData: boolean,
  blendMode: BlendMode | null,
): GPURenderPipeline {
  const runtime = getWgpuRenderStateRuntime(state);
  let perModule = resources.pipelines.get(module);
  if (perModule === undefined) {
    perModule = new Map();
    resources.pipelines.set(module, perModule);
  }
  const stencilMode = runtime.maskWriteMode ? 'maskwrite' : runtime.currentMaskDepth > 0 ? 'masked' : 'normal';
  // The pipeline bakes its color-attachment format, so key on the current target format too (rgba16float
  // inside an HDR effect target vs the canvas format).
  const format = runtime.currentColorFormat ?? state.format;
  const key = `${blendMode ?? 'null'}-${stencilMode}-${format}`;
  const cached = perModule.get(key);
  if (cached !== undefined) return cached;

  const { device } = state;
  const blend = getWgpuBlendState(blendMode);
  const isMaskWrite = stencilMode === 'maskwrite';

  let stencilFace: GPUStencilFaceState;
  if (isMaskWrite) {
    stencilFace = { compare: 'always', passOp: 'replace', failOp: 'keep', depthFailOp: 'keep' };
  } else if (stencilMode === 'masked') {
    stencilFace = { compare: 'equal', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' };
  } else {
    stencilFace = { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' };
  }

  const pipeline = device.createRenderPipeline({
    layout: hasMaterialData ? resources.materialPipelineLayout : resources.basePipelineLayout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [{ format, blend: isMaskWrite ? undefined : blend, writeMask: isMaskWrite ? 0 : GPUColorWrite.ALL }],
    },
    depthStencil: {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: stencilFace,
      stencilBack: stencilFace,
      stencilReadMask: 0xff,
      stencilWriteMask: isMaskWrite ? 0xff : 0x00,
    },
    primitive: { topology: 'triangle-list' },
  });

  perModule.set(key, pipeline);
  return pipeline;
}

// Returns the shared WGSL prelude a material shader prepends before its own VertexOut/vs_main/fs_main
// (and optional @group(3) material buffer). Exposed so a user-authored material can build on the same
// base instance contract the bundled materials use.
export function getWgpuQuadBatchPreludeWGSL(): string {
  return QUAD_BATCH_PRELUDE_WGSL;
}

// Writes one instance's per-instance material floats into the parallel material buffer at the
// instance's slot. No-op for materials with no per-instance data (floats === 0 / no packInstance),
// so the base path never assumes any particular material contributes here.
export function packWgpuQuadBatchMaterialInstance(
  state: WgpuRenderState,
  materialData: MaterialData | null,
  instanceIndex: number,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const floats = runtime.quadBatchWriterMaterialFloats;
  if (floats === 0) return;
  const renderer = runtime.quadBatchWriterMaterialRenderer;
  if (renderer === null || renderer.packInstance === undefined) return;
  renderer.packInstance(
    state,
    runtime.quadBatchWriterMaterial,
    materialData,
    runtime.quadBatchWriterMaterialData,
    instanceIndex * floats,
  );
}

// Ensures the quad-batch writer can accept up to `maxInstances` more instances for the given texture,
// blend mode, and material. Flushes when any of the three changes (material by reference) or
// capacity is exceeded. Returns the float index in quadBatchWriterInstanceData where the caller writes
// base instance data; the caller increments the runtime's quadBatchWriterCount and calls
// packWgpuQuadBatchMaterialInstance per instance.
export function prepareWgpuQuadBatchWrite(
  state: WgpuRenderState,
  texture: Readonly<WgpuTextureEntry>,
  sampler: Readonly<SamplerLike> | null,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: WgpuMaterialRenderer,
  maxInstances: number,
  smoothing: boolean | null = null,
): number {
  const runtime = getWgpuRenderStateRuntime(state);
  if (
    texture !== runtime.quadBatchWriterTexture ||
    sampler !== runtime.quadBatchWriterSampler ||
    blendMode !== runtime.quadBatchWriterBlendMode ||
    material !== runtime.quadBatchWriterMaterial ||
    smoothing !== runtime.quadBatchWriterSmoothing
  ) {
    flushWgpuQuadBatchWriter(state);
  }
  runtime.quadBatchWriterTexture = texture;
  runtime.quadBatchWriterSampler = sampler;
  runtime.quadBatchWriterSmoothing = smoothing;
  runtime.quadBatchWriterBlendMode = blendMode;
  runtime.quadBatchWriterMaterial = material;
  runtime.quadBatchWriterMaterialRenderer = materialRenderer;
  const floats = materialRenderer.instanceFloatCount;
  runtime.quadBatchWriterMaterialFloats = floats;

  const needed = (runtime.quadBatchWriterCount + maxInstances) * QUAD_BATCH_INSTANCE_FLOATS;
  if (needed > runtime.quadBatchWriterInstanceData.length) {
    const newSize = Math.max(needed, runtime.quadBatchWriterInstanceData.length * 2, QUAD_BATCH_INSTANCE_FLOATS * 256);
    runtime.quadBatchWriterInstanceData = new Float32Array(newSize);
  }

  if (floats > 0) {
    const materialNeeded = (runtime.quadBatchWriterCount + maxInstances) * floats;
    if (materialNeeded > runtime.quadBatchWriterMaterialData.length) {
      const newSize = Math.max(materialNeeded, runtime.quadBatchWriterMaterialData.length * 2, floats * 256);
      runtime.quadBatchWriterMaterialData = new Float32Array(newSize);
    }
  }

  return runtime.quadBatchWriterCount * QUAD_BATCH_INSTANCE_FLOATS;
}

// Folds instance `instanceIndex`'s effective color adjustment into the active batch through the opt-in
// color-adjustment fold, without ever splitting the batch. When the capability was not enabled
// (registerWgpuColorAdjustmentMaterialFeature), the fold slot is null and the tint is skipped — the batch draws
// untinted (the sentinel behavior, never a throw); an installed guard reports the miss. `colorScaleBias`
// is null/undefined for an untinted instance, which is a no-op whether or not the fold is enabled.
export function recordWgpuQuadBatchColorScaleBias(
  state: WgpuRenderState,
  colorScaleBias: ColorScaleBias | TintMaterialData | readonly number[] | null | undefined,
  instanceIndex: number,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const fold = getWgpuColorAdjustmentMaterialFeature(state);
  if (fold != null) {
    fold.record(runtime, colorScaleBias, instanceIndex);
    return;
  }
  if (colorScaleBias != null) getWgpuColorAdjustmentMaterialFeatureGuard(state)?.(state, colorScaleBias);
}

// Resets the per-frame buffer-pool cursor so the next frame reclaims slots from the start. Must be
// called once at the start of each frame's batch work — the screen frame via renderWgpuBackground,
// and the offscreen cache bake via refreshWgpuRenderCache (the bake flushes on its own state).
export function resetWgpuQuadBatchWriterBufferPool(state: WgpuRenderState): void {
  getWgpuRenderStateRuntime(state).quadBatchWriterBufferCursor = 0;
}

// Claims the next per-frame pool slot, allocating one if the frame has more flushes than any prior
// frame. The cursor is reset to 0 each frame by resetWgpuQuadBatchWriterBufferPool.
function acquireWgpuQuadBatchWriterBufferSlot(state: WgpuRenderState): WgpuQuadBatchWriterBufferSlot {
  const runtime = getWgpuRenderStateRuntime(state);
  const pool = runtime.quadBatchWriterBufferPool;
  let slot = pool[runtime.quadBatchWriterBufferCursor];
  if (slot === undefined) {
    slot = { instanceBuffer: null, instanceCapacity: 0, materialBuffer: null, materialCapacity: 0 };
    pool[runtime.quadBatchWriterBufferCursor] = slot;
  }
  runtime.quadBatchWriterBufferCursor++;
  return slot;
}

function createWgpuQuadBatchWriterBuffer(state: WgpuRenderState, size: number): GPUBuffer {
  return state.device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
}

function resetWgpuQuadBatchWriter(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.quadBatchWriterCount = 0;
  runtime.quadBatchWriterTexture = null;
  runtime.quadBatchWriterSampler = null;
  runtime.quadBatchWriterSmoothing = null;
  runtime.quadBatchWriterBlendMode = null;
  runtime.quadBatchWriterMaterial = null;
  runtime.quadBatchWriterMaterialRenderer = null;
  runtime.quadBatchWriterMaterialFloats = 0;
}

function createWgpuTextureSamplerBindGroup(
  state: WgpuRenderState,
  view: GPUTextureView,
  sampler: Readonly<SamplerLike>,
): GPUBindGroup {
  const minFilter: GPUFilterMode = sampler.minFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const magFilter: GPUFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const mipmapFilter: GPUFilterMode | undefined =
    sampler.mipmaps && sampler.minFilter.includes('mipmap')
      ? sampler.minFilter.endsWith('nearest')
        ? 'nearest'
        : 'linear'
      : undefined;
  return state.device.createBindGroup({
    layout: getWgpuRenderStateDeviceResources(state).textureBindGroupLayout,
    entries: [
      { binding: 0, resource: view },
      {
        binding: 1,
        resource: getWgpuSampler(
          state,
          minFilter,
          magFilter,
          sampler.wrapU,
          sampler.wrapV,
          mipmapFilter,
          sampler.anisotropy,
        ),
      },
    ],
  });
}

// Writes the NDC viewport matrix and the shared texture's alpha representation into the uniform ring,
// then advances the ring offset. Returns the byte offset for the dynamic bind-group binding.
function writeWgpuQuadBatchWriterUniforms(state: WgpuRenderState, straightTextureAlpha: boolean): number {
  const runtime = getWgpuRenderStateRuntime(state);
  const uniformOffset = runtime.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData, uniformDataU32 } = runtime;
  const viewport = runtime.renderTargetViewport ?? getWgpuSurfaceRenderExtent(state);
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;

  uniformData[floatBase + 0] = iw;
  uniformData[floatBase + 1] = 0;
  uniformData[floatBase + 2] = 0;
  uniformData[floatBase + 3] = 0;
  uniformData[floatBase + 4] = 0;
  uniformData[floatBase + 5] = -ih;
  uniformData[floatBase + 6] = 0;
  uniformData[floatBase + 7] = 0;
  uniformData[floatBase + 8] = -1;
  uniformData[floatBase + 9] = 1;
  uniformData[floatBase + 10] = 1;
  uniformData[floatBase + 11] = 0;
  uniformDataU32[floatBase + 12] = straightTextureAlpha ? 1 : 0;
  runtime.uniformOffset += runtime.uniformStride;
  return uniformOffset;
}
