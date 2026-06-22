import { bindWgpuTexture } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Material,
  MaterialData,
  WgpuMaterialRenderer,
  WgpuRenderState,
  WgpuSpriteBatchBufferSlot,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

// Base per-instance layout (13 floats = 52 bytes). This is a fixed contract material shaders read
// from the instance storage buffer; it carries no material concern (no color transform). A material
// that needs per-instance data writes it into a parallel material storage buffer instead.
// [0-3]   a, b, c, d   — world-space 2D matrix
// [4-5]   tx, ty       — world-space translation
// [6-7]   width, height — region size in pixels
// [8-11]  u0,v0,u1,v1  — atlas UV rect
// [12]    alpha        — per-instance alpha
export const SPRITE_INSTANCE_FLOATS = 13;
const SPRITE_INSTANCE_STRIDE = SPRITE_INSTANCE_FLOATS * 4;

// Shared WGSL prelude for sprite-batch material shaders: the base Uniforms and InstanceData structs,
// the standard bind-group bindings (@group(0) uniform, @group(1) texture/sampler, @group(2)
// instances), and a quadBaseVertex helper that expands one instance corner into clip-space position,
// UV, and alpha. A material module appends its own @group(3) material buffer (when it uses one), a
// VertexOut struct, vs_main, and fs_main. The base path knows nothing about what a material does
// with this — color transform and any other effect live entirely in the material's own module.
const QUAD_BATCH_PRELUDE_WGSL = /* wgsl */ `
struct Uniforms {
  matrix : mat3x3f,
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
  const existing = _quadBatchResources.get(state.device);
  if (existing !== undefined) return existing;

  const { device } = state;
  const { uniformBindGroupLayout, textureBindGroupLayout } = runtime;

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
  _quadBatchResources.set(device, resources);
  return resources;
}

export interface WgpuQuadBatchResources {
  instanceBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  basePipelineLayout: GPUPipelineLayout;
  materialPipelineLayout: GPUPipelineLayout;
  // Pipelines keyed first by the material's shader module, then by blend+stencil state.
  pipelines: WeakMap<GPUShaderModule, Map<string, GPURenderPipeline>>;
}

const _quadBatchResources = new WeakMap<GPUDevice, WgpuQuadBatchResources>();

const NORMAL_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

const ADD_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

export function flushWgpuSpriteBatch(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const count = runtime.spriteBatchCount;
  if (count === 0 || runtime.renderPass === null) {
    resetWgpuSpriteBatch(state);
    return;
  }

  const texture = runtime.spriteBatchTexture!;
  const blendMode = runtime.spriteBatchBlendMode;
  const renderer = runtime.spriteBatchMaterialRenderer!;
  const floats = runtime.spriteBatchMaterialFloats;
  resetWgpuSpriteBatch(state);

  const resources = ensureWgpuQuadBatchResources(state);

  // Claim a distinct pool slot for this flush. The canvas pass is submitted once at end of frame, so
  // a buffer shared across flushes would be rewritten before any draw reads it, leaving every draw
  // reading the last flush's data. A per-flush slot keeps each draw's instances intact until submit.
  const slot = acquireWgpuSpriteBatchBufferSlot(state);

  const instanceBytes = count * SPRITE_INSTANCE_STRIDE;
  if (slot.instanceBuffer === null || slot.instanceCapacity < instanceBytes) {
    const capacity = Math.max(instanceBytes, slot.instanceCapacity * 2, SPRITE_INSTANCE_STRIDE * 256);
    slot.instanceBuffer = createWgpuSpriteBatchBuffer(state, capacity);
    slot.instanceCapacity = capacity;
  }
  state.device.queue.writeBuffer(slot.instanceBuffer, 0, runtime.spriteBatchInstanceData.buffer, 0, instanceBytes);

  if (floats > 0) {
    const materialBytes = count * floats * 4;
    if (slot.materialBuffer === null || slot.materialCapacity < materialBytes) {
      const capacity = Math.max(materialBytes, slot.materialCapacity * 2, floats * 4 * 256);
      slot.materialBuffer = createWgpuSpriteBatchBuffer(state, capacity);
      slot.materialCapacity = capacity;
    }
    state.device.queue.writeBuffer(slot.materialBuffer, 0, runtime.spriteBatchMaterialData.buffer, 0, materialBytes);
  }

  state.applyBlendMode?.(state, blendMode);
  const textureEntry = bindWgpuTexture(state, texture);

  const uniformOffset = writeWgpuSpriteBatchUniforms(state);

  const instanceBindGroup = state.device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: slot.instanceBuffer } }],
  });

  const module = renderer.getShaderModule(state);
  const pipeline = getWgpuQuadBatchPipeline(state, resources, module, floats > 0, blendMode);
  const pass = runtime.renderPass!;
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, runtime.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  if (floats > 0) {
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
  const blend = blendMode === BlendMode.Add ? ADD_BLEND : NORMAL_BLEND;
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
export function packWgpuSpriteBatchMaterialInstance(
  state: WgpuRenderState,
  materialData: MaterialData | null,
  instanceIndex: number,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const floats = runtime.spriteBatchMaterialFloats;
  if (floats === 0) return;
  const renderer = runtime.spriteBatchMaterialRenderer;
  if (renderer === null || renderer.packInstance === undefined) return;
  renderer.packInstance(
    state,
    runtime.spriteBatchMaterial,
    materialData,
    runtime.spriteBatchMaterialData,
    instanceIndex * floats,
  );
}

// Ensures the sprite batch can accept up to `maxInstances` more instances for the given texture,
// blend mode, and material. Flushes when any of the three changes (material by reference) or
// capacity is exceeded. Returns the float index in spriteBatchInstanceData where the caller writes
// base instance data; the caller increments the runtime's spriteBatchCount and calls
// packWgpuSpriteBatchMaterialInstance per instance.
export function prepareWgpuSpriteBatchWrite(
  state: WgpuRenderState,
  texture: CanvasImageSource,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: WgpuMaterialRenderer,
  maxInstances: number,
): number {
  const runtime = getWgpuRenderStateRuntime(state);
  if (
    texture !== runtime.spriteBatchTexture ||
    blendMode !== runtime.spriteBatchBlendMode ||
    material !== runtime.spriteBatchMaterial
  ) {
    flushWgpuSpriteBatch(state);
  }
  runtime.spriteBatchTexture = texture;
  runtime.spriteBatchBlendMode = blendMode;
  runtime.spriteBatchMaterial = material;
  runtime.spriteBatchMaterialRenderer = materialRenderer;
  const floats = materialRenderer.instanceFloatCount;
  runtime.spriteBatchMaterialFloats = floats;

  const needed = (runtime.spriteBatchCount + maxInstances) * SPRITE_INSTANCE_FLOATS;
  if (needed > runtime.spriteBatchInstanceData.length) {
    const newSize = Math.max(needed, runtime.spriteBatchInstanceData.length * 2, SPRITE_INSTANCE_FLOATS * 256);
    runtime.spriteBatchInstanceData = new Float32Array(newSize);
  }

  if (floats > 0) {
    const materialNeeded = (runtime.spriteBatchCount + maxInstances) * floats;
    if (materialNeeded > runtime.spriteBatchMaterialData.length) {
      const newSize = Math.max(materialNeeded, runtime.spriteBatchMaterialData.length * 2, floats * 256);
      runtime.spriteBatchMaterialData = new Float32Array(newSize);
    }
  }

  return runtime.spriteBatchCount * SPRITE_INSTANCE_FLOATS;
}

// Resets the per-frame buffer-pool cursor so the next frame reclaims slots from the start. Must be
// called once at the start of each frame's batch work — the screen frame via renderWgpuBackground,
// and the offscreen cache bake via refreshWgpuRenderCache (the bake flushes on its own state).
export function resetWgpuSpriteBatchBufferPool(state: WgpuRenderState): void {
  getWgpuRenderStateRuntime(state).spriteBatchBufferCursor = 0;
}

// Claims the next per-frame pool slot, allocating one if the frame has more flushes than any prior
// frame. The cursor is reset to 0 each frame by resetWgpuSpriteBatchBufferPool.
function acquireWgpuSpriteBatchBufferSlot(state: WgpuRenderState): WgpuSpriteBatchBufferSlot {
  const runtime = getWgpuRenderStateRuntime(state);
  const pool = runtime.spriteBatchBufferPool;
  let slot = pool[runtime.spriteBatchBufferCursor];
  if (slot === undefined) {
    slot = { instanceBuffer: null, instanceCapacity: 0, materialBuffer: null, materialCapacity: 0 };
    pool[runtime.spriteBatchBufferCursor] = slot;
  }
  runtime.spriteBatchBufferCursor++;
  return slot;
}

function createWgpuSpriteBatchBuffer(state: WgpuRenderState, size: number): GPUBuffer {
  return state.device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
}

function resetWgpuSpriteBatch(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.spriteBatchCount = 0;
  runtime.spriteBatchTexture = null;
  runtime.spriteBatchBlendMode = null;
  runtime.spriteBatchMaterial = null;
  runtime.spriteBatchMaterialRenderer = null;
  runtime.spriteBatchMaterialFloats = 0;
}

// Writes the NDC viewport matrix into the uniform ring (the only uniform the batch shader reads) and
// advances the ring offset. Returns the byte offset for the dynamic bind-group binding.
function writeWgpuSpriteBatchUniforms(state: WgpuRenderState): number {
  const runtime = getWgpuRenderStateRuntime(state);
  const uniformOffset = runtime.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData } = runtime;
  const viewport = runtime.renderTargetViewport ?? state.canvas;
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
  runtime.uniformOffset += runtime.uniformStride;
  return uniformOffset;
}
