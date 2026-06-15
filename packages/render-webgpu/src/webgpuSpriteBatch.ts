import type { ColorTransform } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture } from './webgpuDraw';

// Per-instance layout (13 floats = 52 bytes, world-space transforms + per-instance alpha):
// [0-3]  a, b, c, d   — world-space 2D matrix
// [4-5]  tx, ty       — world-space translation
// [6-7]  width, height — region size in pixels
// [8-11] u0,v0,u1,v1  — atlas UV rect
// [12]   alpha        — per-instance alpha
const SPRITE_INSTANCE_FLOATS = 13;
const SPRITE_INSTANCE_STRIDE = SPRITE_INSTANCE_FLOATS * 4;

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
  alpha : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var<storage, read> instances : array<InstanceData>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
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
  out.alpha = inst.alpha;
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (uni.hasColorTransform != 0u && color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = clamp(color * uni.colorMultiplier + uni.colorOffset, vec4f(0.0), vec4f(1.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
`;

export interface WebGPUQuadBatchResources {
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

export function ensureWebGPUQuadBatchResources(state: WebGPURenderStateInternal): WebGPUQuadBatchResources {
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

export function flushWebGPUSpriteBatch(state: WebGPURenderStateInternal): void {
  const count = state.spriteBatchCount;
  if (count === 0 || state.renderPass === null) return;

  const texture = state.spriteBatchTexture!;
  const blendMode = state.spriteBatchBlendMode;
  const colorTransform = state.spriteBatchColorTransform;
  state.spriteBatchCount = 0;
  state.spriteBatchTexture = null;
  state.spriteBatchBlendMode = null;
  state.spriteBatchColorTransform = null;

  const resources = ensureWebGPUQuadBatchResources(state);
  const neededBytes = count * SPRITE_INSTANCE_STRIDE;

  if (state.spriteBatchInstanceCapacity < neededBytes || state.spriteBatchInstanceBuffer === null) {
    state.spriteBatchInstanceBuffer?.destroy();
    const newCapacity = Math.max(
      neededBytes,
      (state.spriteBatchInstanceCapacity || 0) * 2,
      SPRITE_INSTANCE_STRIDE * 256,
    );
    state.spriteBatchInstanceBuffer = state.device.createBuffer({
      size: newCapacity,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    state.spriteBatchInstanceCapacity = newCapacity;
  }

  state.device.queue.writeBuffer(
    state.spriteBatchInstanceBuffer!,
    0,
    state.spriteBatchInstanceData.buffer,
    0,
    count * SPRITE_INSTANCE_STRIDE,
  );

  state.applyBlendMode?.(state, blendMode);
  const textureEntry = bindWebGPUTexture(state, texture);

  const uniformOffset = state.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData, uniformDataU32 } = state;
  const viewport = state.renderTargetViewport ?? state.canvas;
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;

  // Pure NDC viewport matrix (column-major mat3x3 with vec3-to-vec4 padding)
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
  uniformData[floatBase + 12] = 1;
  uniformDataU32[floatBase + 13] = colorTransform !== null ? 1 : 0;
  uniformData[floatBase + 14] = 0;
  uniformData[floatBase + 15] = 0;
  if (colorTransform !== null) {
    uniformData[floatBase + 16] = colorTransform.redMultiplier;
    uniformData[floatBase + 17] = colorTransform.greenMultiplier;
    uniformData[floatBase + 18] = colorTransform.blueMultiplier;
    uniformData[floatBase + 19] = colorTransform.alphaMultiplier;
    uniformData[floatBase + 20] = colorTransform.redOffset / 255;
    uniformData[floatBase + 21] = colorTransform.greenOffset / 255;
    uniformData[floatBase + 22] = colorTransform.blueOffset / 255;
    uniformData[floatBase + 23] = colorTransform.alphaOffset / 255;
  } else {
    for (let k = 16; k < 24; k++) uniformData[floatBase + k] = 0;
  }
  for (let k = 24; k < 32; k++) uniformData[floatBase + k] = 0;
  state.uniformOffset += state.uniformStride;

  const instanceBindGroup = state.device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: state.spriteBatchInstanceBuffer! } }],
  });

  const pipeline = getWebGPUQuadBatchPipeline(state, resources, blendMode);
  const pass = state.renderPass!;
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, state.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  if (state.currentMaskDepth > 0) pass.setStencilReference(state.currentMaskDepth);
  pass.draw(6, count, 0, 0);
}

export function getWebGPUQuadBatchPipeline(
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

// Ensures the sprite batch can accept up to `maxInstances` additional instances for the given
// texture, blend mode, and color transform. Flushes the current batch if the key changes or
// capacity is exceeded. Returns the float index in spriteBatchInstanceData where the caller
// should begin writing. Caller is responsible for incrementing state.spriteBatchCount.
export function prepareWebGPUSpriteBatchWrite(
  state: WebGPURenderStateInternal,
  texture: CanvasImageSource,
  blendMode: BlendMode | null,
  colorTransform: ColorTransform | null,
  maxInstances: number,
): number {
  if (
    texture !== state.spriteBatchTexture ||
    blendMode !== state.spriteBatchBlendMode ||
    colorTransform !== state.spriteBatchColorTransform
  ) {
    flushWebGPUSpriteBatch(state);
  }
  state.spriteBatchTexture = texture;
  state.spriteBatchBlendMode = blendMode;
  state.spriteBatchColorTransform = colorTransform;

  const needed = (state.spriteBatchCount + maxInstances) * SPRITE_INSTANCE_FLOATS;
  if (needed > state.spriteBatchInstanceData.length) {
    const newSize = Math.max(needed, state.spriteBatchInstanceData.length * 2, SPRITE_INSTANCE_FLOATS * 256);
    state.spriteBatchInstanceData = new Float32Array(newSize);
  }

  return state.spriteBatchCount * SPRITE_INSTANCE_FLOATS;
}
