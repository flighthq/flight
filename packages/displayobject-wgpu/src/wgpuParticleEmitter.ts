import { hasImageResourcePixels } from '@flighthq/image';
import { noopRendererData } from '@flighthq/render';
import { bindWgpuImageResourceTexture } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { ParticleEmitter, RenderProxy2D, SpriteRenderer, WgpuRenderState } from '@flighthq/types';

import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';

// Per-instance layout in the instance buffer (14 floats = 56 bytes):
//   0: px, 1: py, 2: cosScale, 3: sinScale
//   4: r, 5: g, 6: b, 7: alpha
//   8: u0, 9: v0, 10: u1, 11: v1
//   12: width, 13: height
const INSTANCE_FLOATS = 14;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

// WGSL for the particle instanced shader
const PARTICLE_SHADER_SRC = /* wgsl */ `
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
  px : f32, py : f32,
  cosScale : f32, sinScale : f32,
  r : f32, g : f32, b : f32, alpha : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
  width : f32, height : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var<storage, read> instances : array<InstanceData>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec4f,
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
  // Rotate and translate in world space
  let rx = inst.cosScale * lx - inst.sinScale * ly + inst.px;
  let ry = inst.sinScale * lx + inst.cosScale * ly + inst.py;
  let p = uni.matrix * vec3f(rx, ry, 1.0);
  let u = select(inst.u0, inst.u1, xi);
  let v = select(inst.v0, inst.v1, yi);
  var out : VertexOut;
  out.position = vec4f(p.x, p.y, 0.0, 1.0);
  out.uv = vec2f(u, v);
  out.color = vec4f(inst.r, inst.g, inst.b, inst.alpha);
  return out;
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  let tex_color = textureSample(tex, smp, in.uv);
  let out_color = vec4f(tex_color.rgb * in.color.rgb, tex_color.a) * in.color.a;
  if (out_color.a <= 0.0) { discard; }
  return out_color;
}
`;

interface WgpuParticleResources {
  // Per color-attachment format, since a render pipeline bakes its target format (rgba16float inside an
  // HDR effect target vs the canvas format). The layout/module are format-independent and shared.
  pipelines: Map<GPUTextureFormat, GPURenderPipeline>;
  pipelineLayout: GPUPipelineLayout;
  module: GPUShaderModule;
  instanceBindGroupLayout: GPUBindGroupLayout;
}

const _particleResources = new WeakMap<GPUDevice, WgpuParticleResources>();

function ensureParticleResources(state: WgpuRenderState): WgpuParticleResources {
  const existing = _particleResources.get(state.device);
  if (existing !== undefined) return existing;

  const runtime = getWgpuRenderStateRuntime(state);
  const { device } = state;
  const { uniformBindGroupLayout, textureBindGroupLayout } = runtime;

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

  const module = device.createShaderModule({ code: PARTICLE_SHADER_SRC });

  const resources: WgpuParticleResources = {
    pipelines: new Map(),
    pipelineLayout,
    module,
    instanceBindGroupLayout,
  };
  _particleResources.set(device, resources);
  return resources;
}

// Returns the particle pipeline for the current target's color format, building and caching it on demand.
function getParticlePipeline(state: WgpuRenderState, resources: WgpuParticleResources): GPURenderPipeline {
  const format = getWgpuRenderStateRuntime(state).currentColorFormat ?? state.format;
  const existing = resources.pipelines.get(format);
  if (existing !== undefined) return existing;

  const pipeline = state.device.createRenderPipeline({
    layout: resources.pipelineLayout,
    vertex: { module: resources.module, entryPoint: 'vs_main' },
    fragment: {
      module: resources.module,
      entryPoint: 'fs_main',
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        },
      ],
    },
    depthStencil: {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
      stencilBack: { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
      stencilReadMask: 0xff,
      stencilWriteMask: 0x00,
    },
    primitive: { topology: 'triangle-list' },
  });

  resources.pipelines.set(format, pipeline);
  return pipeline;
}

function ensureParticleInstanceBuffer(state: WgpuRenderState, count: number): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const needed = count * INSTANCE_STRIDE;
  if (runtime.particleInstanceCapacity >= needed && runtime.particleInstanceBuffer !== null) return;

  // Defer the old buffer's destruction: another emitter earlier this frame may have recorded a draw
  // referencing it, and the frame's submit is deferred to submitWgpuRenderPass.
  if (runtime.particleInstanceBuffer !== null) {
    (runtime.retiredBuffers ?? (runtime.retiredBuffers = [])).push(runtime.particleInstanceBuffer);
  }
  const newCapacity = Math.max(needed, (runtime.particleInstanceCapacity || 0) * 2);
  runtime.particleInstanceBuffer = state.device.createBuffer({
    size: Math.max(newCapacity, INSTANCE_STRIDE),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  runtime.particleInstanceCapacity = newCapacity;
  runtime.particleInstanceData = new Float32Array(newCapacity / 4);
}

export function drawWgpuParticleEmitter(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as ParticleEmitter;
  const { atlas, alphas, colors, ids, particleCount, transforms } = source.data;
  if (atlas === null || atlas.image === null || !hasImageResourcePixels(atlas.image) || particleCount === 0) return;

  const resources = ensureParticleResources(state);
  ensureParticleInstanceBuffer(state, particleCount);

  state.applyBlendMode?.(state, renderProxy.blendMode);
  const textureEntry = bindWgpuImageResourceTexture(state, atlas.image);

  const regions = atlas.regions;
  const numRegions = regions.length;
  const nodeAlpha = renderProxy.alpha;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const instanceData = runtime.particleInstanceData!;

  let drawCount = 0;
  let base = 0;
  for (let i = 0; i < particleCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) continue;

    const tt = i * 4;
    const px = transforms[tt];
    const py = transforms[tt + 1];
    const rotation = transforms[tt + 2];
    const scale = transforms[tt + 3];
    const cosR = Math.cos(rotation) * scale;
    const sinR = Math.sin(rotation) * scale;

    const ct = i * 3;
    const hasColors = colors != null && colors.length > ct + 2;
    instanceData[base + 0] = px;
    instanceData[base + 1] = py;
    instanceData[base + 2] = cosR;
    instanceData[base + 3] = sinR;
    instanceData[base + 4] = hasColors ? colors![ct] : 1;
    instanceData[base + 5] = hasColors ? colors![ct + 1] : 1;
    instanceData[base + 6] = hasColors ? colors![ct + 2] : 1;
    instanceData[base + 7] = nodeAlpha * alphas[i];
    instanceData[base + 8] = region.x * iw;
    instanceData[base + 9] = region.y * ih;
    instanceData[base + 10] = (region.x + region.width) * iw;
    instanceData[base + 11] = (region.y + region.height) * ih;
    instanceData[base + 12] = region.width;
    instanceData[base + 13] = region.height;
    base += INSTANCE_FLOATS;
    drawCount++;
  }

  if (drawCount === 0) return;

  const { device } = state;

  // Upload instance data
  device.queue.writeBuffer(runtime.particleInstanceBuffer!, 0, instanceData.buffer, 0, drawCount * INSTANCE_STRIDE);

  // Write uniform slot for this emitter (world transform → clip space; quad coords are unused)
  const uniformOffset = runtime.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData, uniformDataU32, matrixArray } = runtime;
  const viewport = runtime.renderTargetViewport ?? state.canvas;
  const t = renderProxy.transform2D;

  let iw2: number, ih2: number;
  if (source.data.worldSpace) {
    // Particles are already in world (pixel) space — map directly through viewport
    iw2 = 2 / viewport.width;
    ih2 = 2 / viewport.height;
    matrixArray[0] = iw2;
    matrixArray[1] = 0;
    matrixArray[2] = 0;
    matrixArray[3] = 0;
    matrixArray[4] = -ih2;
    matrixArray[5] = 0;
    matrixArray[6] = -1;
    matrixArray[7] = 1;
    matrixArray[8] = 1;
  } else {
    iw2 = 2 / viewport.width;
    ih2 = 2 / viewport.height;
    matrixArray[0] = t.a * iw2;
    matrixArray[1] = -t.b * ih2;
    matrixArray[2] = 0;
    matrixArray[3] = t.c * iw2;
    matrixArray[4] = -t.d * ih2;
    matrixArray[5] = 0;
    matrixArray[6] = t.tx * iw2 - 1;
    matrixArray[7] = -t.ty * ih2 + 1;
    matrixArray[8] = 1;
  }

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
  uniformData[floatBase + 12] = 1; // alpha = 1 (per-instance handles alpha)
  uniformDataU32[floatBase + 13] = 0;
  for (let k = 14; k < 32; k++) uniformData[floatBase + k] = 0;
  runtime.uniformOffset += runtime.uniformStride;

  // Create per-frame instance bind group
  const instanceBindGroup = device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: runtime.particleInstanceBuffer! } }],
  });

  const pass = runtime.renderPass!;
  pass.setPipeline(getParticlePipeline(state, resources));
  pass.setBindGroup(0, runtime.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  pass.draw(6, drawCount, 0, 0);
}

export const defaultWgpuParticleEmitterRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit(state: WgpuRenderState, node: RenderProxy2D): void {
    flushWgpuSpriteBatch(state);
    drawWgpuParticleEmitter(state, node);
  },
};
