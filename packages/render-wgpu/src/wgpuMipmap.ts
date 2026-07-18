import type { WgpuRenderState } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

// Generates the mip chain for an already-uploaded texture by downsampling each level into the next
// through a cached fullscreen pipeline. WebGPU has no generateMipmap, so lower levels are rendered:
// level i samples level i-1 (a single-level view) with a linear clamp sampler and draws a fullscreen
// triangle into level i. The texture must have been created with the matching mipLevelCount (see
// getWgpuMipLevelCount) and RENDER_ATTACHMENT usage. A single-level (1x1) texture is a no-op.
export function generateWgpuMipmaps(
  state: WgpuRenderState,
  texture: GPUTexture,
  width: number,
  height: number,
  format: GPUTextureFormat,
): void {
  const levelCount = getWgpuMipLevelCount(width, height);
  if (levelCount <= 1) return;
  const { device } = state;
  const runtime = getWgpuRenderStateRuntime(state);
  const pipeline = ensureWgpuMipmapPipeline(state, format);
  const layout = runtime.mipmapBindGroupLayout as GPUBindGroupLayout;
  const encoder = device.createCommandEncoder();
  for (let level = 1; level < levelCount; level++) {
    const srcView = texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 });
    const dstView = texture.createView({ baseMipLevel: level, mipLevelCount: 1 });
    const bindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: runtime.linearSampler },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: dstView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}

// The number of mip levels in a full chain down to 1x1 for the given base dimensions. A 1x1 (or
// smaller) base has a single level, so generateWgpuMipmaps has nothing to render.
export function getWgpuMipLevelCount(width: number, height: number): number {
  return 1 + Math.floor(Math.log2(Math.max(1, width, height)));
}

// Lazily builds and caches the downsample pipeline (fullscreen triangle → sample the source level →
// write the destination level) and its texture+sampler bind-group layout on the runtime, reused across
// every mip generation on this state. The target format matches the material texture format
// (rgba8unorm); material uploads are the only mip consumer, so one cached pipeline suffices.
function ensureWgpuMipmapPipeline(state: WgpuRenderState, format: GPUTextureFormat): GPURenderPipeline {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.mipmapPipeline != null) return runtime.mipmapPipeline;
  const { device } = state;
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const module = device.createShaderModule({ code: MIPMAP_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  runtime.mipmapBindGroupLayout = bindGroupLayout;
  runtime.mipmapPipeline = pipeline;
  return pipeline;
}

const MIPMAP_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VsOut {
  // Full-screen triangle covering the clip rect; uv in [0,1] with v flipped into texture space.
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  var out : VsOut;
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  return out;
}

@group(0) @binding(0) var srcTexture : texture_2d<f32>;
@group(0) @binding(1) var srcSampler : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSample(srcTexture, srcSampler, uv);
}
`;
