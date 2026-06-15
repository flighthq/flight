import { noopRendererData } from '@flighthq/render';
import type { QuadBatch, RenderState, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture } from './webgpuDraw';
import { buildWebGPUMatrixFromTransform } from './webgpuShader';

// Per-instance layout (12 floats = 48 bytes, all f32 — tightly packed in WGSL storage):
// [0-3]  a, b, c, d    — per-instance 2D matrix (identity for vector2 mode)
// [4-5]  tx, ty        — per-instance translation (dx,dy for vector2 mode)
// [6-7]  width, height — region size in pixels
// [8-11] u0,v0,u1,v1  — atlas UV rect
const INSTANCE_FLOATS = 12;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

const QUAD_BATCH_SHADER_SRC = /* wgsl */ `
struct Uniforms {
  matrix : mat3x3f,
  alpha : f32,
  hasColorTransform : u32,
  _pad0 : f32,
  _pad1 : f32,
  colorMultiplier : vec4f,
  colorOffset : vec4f,
  x0 : f32, y0 : f32, x1 : f32, y1 : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
}

struct InstanceData {
  a : f32, b : f32, c : f32, d : f32,
  tx : f32, ty : f32,
  width : f32, height : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var<storage, read> instances : array<InstanceData>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vi : u32,
  @builtin(instance_index) ii : u32,
) -> VertexOut {
  let inst = instances[ii];
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let lx = select(0.0, inst.width, xi);
  let ly = select(0.0, inst.height, yi);
  let wx = inst.a * lx + inst.c * ly + inst.tx;
  let wy = inst.b * lx + inst.d * ly + inst.ty;
  let p = uni.matrix * vec3f(wx, wy, 1.0);
  let u = select(inst.u0, inst.u1, xi);
  let v = select(inst.v0, inst.v1, yi);
  var out : VertexOut;
  out.position = vec4f(p.x, p.y, 0.0, 1.0);
  out.uv = vec2f(u, v);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  let color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  return color * clamp(uni.alpha, 0.0, 1.0);
}
`;

interface WebGPUQuadBatchResources {
  instanceBindGroupLayout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  module: GPUShaderModule;
  pipelines: Map<string, GPURenderPipeline>;
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

function ensureQuadBatchResources(state: WebGPURenderStateInternal): WebGPUQuadBatchResources {
  const existing = _quadBatchResources.get(state.device);
  if (existing !== undefined) return existing;

  const { device, uniformBindGroupLayout, textureBindGroupLayout } = state;

  const instanceBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout, textureBindGroupLayout, instanceBindGroupLayout],
  });

  const module = device.createShaderModule({ code: QUAD_BATCH_SHADER_SRC });

  const resources: WebGPUQuadBatchResources = {
    instanceBindGroupLayout,
    pipelineLayout,
    module,
    pipelines: new Map(),
  };
  _quadBatchResources.set(device, resources);
  return resources;
}

function getQuadBatchPipeline(
  state: WebGPURenderStateInternal,
  resources: WebGPUQuadBatchResources,
  blendMode: BlendMode | null,
): GPURenderPipeline {
  const stencilMode = state.maskWriteMode ? 'maskwrite' : state.currentMaskDepth > 0 ? 'masked' : 'normal';
  const key = `${blendMode ?? 'null'}-${stencilMode}`;
  const cached = resources.pipelines.get(key);
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
    layout: resources.pipelineLayout,
    vertex: { module: resources.module, entryPoint: 'vs_main' },
    fragment: {
      module: resources.module,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: isMaskWrite ? undefined : blend,
          writeMask: isMaskWrite ? 0 : GPUColorWrite.ALL,
        },
      ],
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

  resources.pipelines.set(key, pipeline);
  return pipeline;
}

function ensureQuadBatchInstanceBuffer(state: WebGPURenderStateInternal, count: number): void {
  const needed = count * INSTANCE_STRIDE;
  if (state.quadBatchInstanceCapacity >= needed && state.quadBatchInstanceBuffer !== null) return;

  state.quadBatchInstanceBuffer?.destroy();
  const newCapacity = Math.max(needed, (state.quadBatchInstanceCapacity || 0) * 2);
  state.quadBatchInstanceBuffer = state.device.createBuffer({
    size: Math.max(newCapacity, INSTANCE_STRIDE),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  state.quadBatchInstanceCapacity = newCapacity;
  state.quadBatchInstanceData = new Float32Array(newCapacity / 4);
}

export function drawWebGPUQuadBatch(state: RenderState, quadBatch: SpriteRenderNode): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || instanceCount === 0) return;

  const resources = ensureQuadBatchResources(internal);
  ensureQuadBatchInstanceBuffer(internal, instanceCount);

  internal.applyBlendMode?.(internal, quadBatch.blendMode);
  const textureEntry = bindWebGPUTexture(internal, atlas.image.src);

  const regions = atlas.regions;
  const numRegions = regions.length;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const instanceData = internal.quadBatchInstanceData!;
  const isVector2 = data.transformType === 'vector2';

  let base = 0;
  let drawCount = 0;
  for (let i = 0; i < instanceCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) continue;

    if (isVector2) {
      const offset = i * 2;
      instanceData[base] = 1;
      instanceData[base + 1] = 0;
      instanceData[base + 2] = 0;
      instanceData[base + 3] = 1;
      instanceData[base + 4] = transforms[offset];
      instanceData[base + 5] = transforms[offset + 1];
    } else {
      const offset = i * 6;
      instanceData[base] = transforms[offset];
      instanceData[base + 1] = transforms[offset + 1];
      instanceData[base + 2] = transforms[offset + 2];
      instanceData[base + 3] = transforms[offset + 3];
      instanceData[base + 4] = transforms[offset + 4];
      instanceData[base + 5] = transforms[offset + 5];
    }
    instanceData[base + 6] = region.width;
    instanceData[base + 7] = region.height;
    instanceData[base + 8] = region.x * iw;
    instanceData[base + 9] = region.y * ih;
    instanceData[base + 10] = (region.x + region.width) * iw;
    instanceData[base + 11] = (region.y + region.height) * ih;
    base += INSTANCE_FLOATS;
    drawCount++;
  }

  if (drawCount === 0) return;

  const { device } = internal;
  device.queue.writeBuffer(internal.quadBatchInstanceBuffer!, 0, instanceData.buffer, 0, drawCount * INSTANCE_STRIDE);

  // One uniform slot for the whole batch: world transform + alpha.
  const uniformOffset = internal.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData, uniformDataU32, matrixArray } = internal;
  const viewport = internal.renderTargetViewport ?? internal.canvas;

  buildWebGPUMatrixFromTransform(matrixArray, quadBatch.transform2D, viewport);

  uniformData[floatBase + 0] = matrixArray[0];
  uniformData[floatBase + 1] = matrixArray[1];
  uniformData[floatBase + 2] = matrixArray[2];
  uniformData[floatBase + 3] = 0;
  uniformData[floatBase + 4] = matrixArray[3];
  uniformData[floatBase + 5] = matrixArray[4];
  uniformData[floatBase + 6] = matrixArray[5];
  uniformData[floatBase + 7] = 0;
  uniformData[floatBase + 8] = matrixArray[6];
  uniformData[floatBase + 9] = matrixArray[7];
  uniformData[floatBase + 10] = matrixArray[8];
  uniformData[floatBase + 11] = 0;
  uniformData[floatBase + 12] = quadBatch.alpha;
  uniformDataU32[floatBase + 13] = 0;
  for (let k = 14; k < 32; k++) uniformData[floatBase + k] = 0;
  internal.uniformOffset += internal.uniformStride;

  const instanceBindGroup = device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: internal.quadBatchInstanceBuffer! } }],
  });

  const pipeline = getQuadBatchPipeline(internal, resources, quadBatch.blendMode);
  const pass = internal.renderPass!;
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, internal.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  if (internal.currentMaskDepth > 0) pass.setStencilReference(internal.currentMaskDepth);
  pass.draw(6, drawCount, 0, 0);
}

export const defaultWebGPUQuadBatchRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawWebGPUQuadBatch,
};
