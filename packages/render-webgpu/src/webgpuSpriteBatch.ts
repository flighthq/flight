import type { Material, MaterialData, WebGPUMaterialRenderer } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture } from './webgpuDraw';

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

export function ensureWebGPUQuadBatchResources(state: WebGPURenderStateInternal): WebGPUQuadBatchResources {
  const existing = _quadBatchResources.get(state.device);
  if (existing !== undefined) return existing;

  const { device, uniformBindGroupLayout, textureBindGroupLayout } = state;

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

  const resources: WebGPUQuadBatchResources = {
    instanceBindGroupLayout,
    materialBindGroupLayout,
    basePipelineLayout,
    materialPipelineLayout,
    pipelines: new WeakMap(),
  };
  _quadBatchResources.set(device, resources);
  return resources;
}

export interface WebGPUQuadBatchResources {
  instanceBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  basePipelineLayout: GPUPipelineLayout;
  materialPipelineLayout: GPUPipelineLayout;
  // Pipelines keyed first by the material's shader module, then by blend+stencil state.
  pipelines: WeakMap<GPUShaderModule, Map<string, GPURenderPipeline>>;
}

const _quadBatchResources = new WeakMap<GPUDevice, WebGPUQuadBatchResources>();

const NORMAL_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

const ADD_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

export function flushWebGPUSpriteBatch(state: WebGPURenderStateInternal): void {
  const count = state.spriteBatchCount;
  if (count === 0 || state.renderPass === null) {
    resetWebGPUSpriteBatch(state);
    return;
  }

  const texture = state.spriteBatchTexture!;
  const blendMode = state.spriteBatchBlendMode;
  const renderer = state.spriteBatchMaterialRenderer!;
  const floats = state.spriteBatchMaterialFloats;
  resetWebGPUSpriteBatch(state);

  const resources = ensureWebGPUQuadBatchResources(state);
  state.spriteBatchInstanceBuffer = ensureWebGPUStorageBuffer(
    state,
    state.spriteBatchInstanceBuffer,
    count * SPRITE_INSTANCE_STRIDE,
    (buffer) => (state.spriteBatchInstanceBuffer = buffer),
    'instance',
  );
  state.device.queue.writeBuffer(
    state.spriteBatchInstanceBuffer!,
    0,
    state.spriteBatchInstanceData.buffer,
    0,
    count * SPRITE_INSTANCE_STRIDE,
  );

  if (floats > 0) {
    state.spriteBatchMaterialBuffer = ensureWebGPUStorageBuffer(
      state,
      state.spriteBatchMaterialBuffer,
      count * floats * 4,
      (buffer) => (state.spriteBatchMaterialBuffer = buffer),
      'material',
    );
    state.device.queue.writeBuffer(
      state.spriteBatchMaterialBuffer!,
      0,
      state.spriteBatchMaterialData.buffer,
      0,
      count * floats * 4,
    );
  }

  state.applyBlendMode?.(state, blendMode);
  const textureEntry = bindWebGPUTexture(state, texture);

  const uniformOffset = writeWebGPUSpriteBatchUniforms(state);

  const instanceBindGroup = state.device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: state.spriteBatchInstanceBuffer! } }],
  });

  const module = renderer.getShaderModule(state);
  const pipeline = getWebGPUQuadBatchPipeline(state, resources, module, floats > 0, blendMode);
  const pass = state.renderPass!;
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, state.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  if (floats > 0) {
    const materialBindGroup = state.device.createBindGroup({
      layout: resources.materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: state.spriteBatchMaterialBuffer! } }],
    });
    pass.setBindGroup(3, materialBindGroup);
  }
  if (state.currentMaskDepth > 0) pass.setStencilReference(state.currentMaskDepth);
  pass.draw(6, count, 0, 0);
}

export function getWebGPUQuadBatchPipeline(
  state: WebGPURenderStateInternal,
  resources: WebGPUQuadBatchResources,
  module: GPUShaderModule,
  hasMaterialData: boolean,
  blendMode: BlendMode | null,
): GPURenderPipeline {
  let perModule = resources.pipelines.get(module);
  if (perModule === undefined) {
    perModule = new Map();
    resources.pipelines.set(module, perModule);
  }
  const stencilMode = state.maskWriteMode ? 'maskwrite' : state.currentMaskDepth > 0 ? 'masked' : 'normal';
  const key = `${blendMode ?? 'null'}-${stencilMode}`;
  const cached = perModule.get(key);
  if (cached !== undefined) return cached;

  const { device, format } = state;
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
export function getWebGPUQuadBatchPreludeWGSL(): string {
  return QUAD_BATCH_PRELUDE_WGSL;
}

// Writes one instance's per-instance material floats into the parallel material buffer at the
// instance's slot. No-op for materials with no per-instance data (floats === 0 / no packInstance),
// so the base path never assumes any particular material contributes here.
export function packWebGPUSpriteBatchMaterialInstance(
  state: WebGPURenderStateInternal,
  materialData: MaterialData | null,
  instanceIndex: number,
): void {
  const floats = state.spriteBatchMaterialFloats;
  if (floats === 0) return;
  const renderer = state.spriteBatchMaterialRenderer;
  if (renderer === null || renderer.packInstance === undefined) return;
  renderer.packInstance(
    state,
    state.spriteBatchMaterial,
    materialData,
    state.spriteBatchMaterialData,
    instanceIndex * floats,
  );
}

// Ensures the sprite batch can accept up to `maxInstances` more instances for the given texture,
// blend mode, and material. Flushes when any of the three changes (material by reference) or
// capacity is exceeded. Returns the float index in spriteBatchInstanceData where the caller writes
// base instance data; the caller increments state.spriteBatchCount and calls
// packWebGPUSpriteBatchMaterialInstance per instance.
export function prepareWebGPUSpriteBatchWrite(
  state: WebGPURenderStateInternal,
  texture: CanvasImageSource,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: WebGPUMaterialRenderer,
  maxInstances: number,
): number {
  if (
    texture !== state.spriteBatchTexture ||
    blendMode !== state.spriteBatchBlendMode ||
    material !== state.spriteBatchMaterial
  ) {
    flushWebGPUSpriteBatch(state);
  }
  state.spriteBatchTexture = texture;
  state.spriteBatchBlendMode = blendMode;
  state.spriteBatchMaterial = material;
  state.spriteBatchMaterialRenderer = materialRenderer;
  const floats = materialRenderer.instanceFloatCount;
  state.spriteBatchMaterialFloats = floats;

  const needed = (state.spriteBatchCount + maxInstances) * SPRITE_INSTANCE_FLOATS;
  if (needed > state.spriteBatchInstanceData.length) {
    const newSize = Math.max(needed, state.spriteBatchInstanceData.length * 2, SPRITE_INSTANCE_FLOATS * 256);
    state.spriteBatchInstanceData = new Float32Array(newSize);
  }

  if (floats > 0) {
    const materialNeeded = (state.spriteBatchCount + maxInstances) * floats;
    if (materialNeeded > state.spriteBatchMaterialData.length) {
      const newSize = Math.max(materialNeeded, state.spriteBatchMaterialData.length * 2, floats * 256);
      state.spriteBatchMaterialData = new Float32Array(newSize);
    }
  }

  return state.spriteBatchCount * SPRITE_INSTANCE_FLOATS;
}

function ensureWebGPUStorageBuffer(
  state: WebGPURenderStateInternal,
  buffer: GPUBuffer | null,
  neededBytes: number,
  setCapacity: (buffer: GPUBuffer) => void,
  which: 'instance' | 'material',
): GPUBuffer {
  const capacity = which === 'instance' ? state.spriteBatchInstanceCapacity : state.spriteBatchMaterialCapacity;
  if (buffer !== null && capacity >= neededBytes) return buffer;
  buffer?.destroy();
  const newCapacity = Math.max(neededBytes, capacity * 2, SPRITE_INSTANCE_STRIDE * 256);
  const created = state.device.createBuffer({
    size: newCapacity,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  if (which === 'instance') state.spriteBatchInstanceCapacity = newCapacity;
  else state.spriteBatchMaterialCapacity = newCapacity;
  setCapacity(created);
  return created;
}

function resetWebGPUSpriteBatch(state: WebGPURenderStateInternal): void {
  state.spriteBatchCount = 0;
  state.spriteBatchTexture = null;
  state.spriteBatchBlendMode = null;
  state.spriteBatchMaterial = null;
  state.spriteBatchMaterialRenderer = null;
  state.spriteBatchMaterialFloats = 0;
}

// Writes the NDC viewport matrix into the uniform ring (the only uniform the batch shader reads) and
// advances the ring offset. Returns the byte offset for the dynamic bind-group binding.
function writeWebGPUSpriteBatchUniforms(state: WebGPURenderStateInternal): number {
  const uniformOffset = state.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData } = state;
  const viewport = state.renderTargetViewport ?? state.canvas;
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
  state.uniformOffset += state.uniformStride;
  return uniformOffset;
}
