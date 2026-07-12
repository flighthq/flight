import type { ColorLut, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import type { WgpuEffectPipeline } from './wgpuEffectPass';
import { EFFECT_VERTEX_WGSL, getWgpuEffectPassState } from './wgpuEffectPass';

// Generic pointwise color-LUT pass — the single fold-in realization for the whole LUT-tier Adjustment
// family on WebGPU. A run of consecutive pointwise adjustments containing any nonlinear (LUT-tier) member
// bakes to ONE 3D `ColorLut` (matrices folded in) and runs through this one trilinear pass instead of one
// pass per op. The LUT uploads as a `size³` rgba8unorm 3D texture (group 2); the shared linear sampler
// does the trilinear interpolation. Sampled color is treated as premultiplied and passed straight into
// the LUT (matching the per-op color passes this replaces); alpha is preserved.
export function applyColorLutPassToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  lut: Readonly<ColorLut>,
): void {
  const { device } = state;
  const fs = getWgpuEffectPassState(state);
  const texture = uploadLutTexture(state, lut);

  const sourceBG = device.createBindGroup({
    layout: fs.textureBGLayout,
    entries: [
      { binding: 0, resource: (source as WgpuRenderTarget).view },
      { binding: 1, resource: fs.sampler },
    ],
  });
  const lutBG = device.createBindGroup({
    layout: getLutBindGroupLayout(state),
    entries: [
      { binding: 0, resource: texture.createView({ dimension: '3d' }) },
      { binding: 1, resource: fs.sampler },
    ],
  });

  const pipeline = getLutPipeline(state, (dest as WgpuRenderTarget).format);
  const slotOffset = fs.acquireSlot();
  fs.writeSlot(slotOffset, (f32) => {
    f32[0] = lut.size;
  });

  const pass = fs.beginPass(dest as WgpuRenderTarget, 'load');
  pass.setPipeline(pipeline.pipeline);
  pass.setBindGroup(0, fs.uniformBG, [slotOffset]);
  pass.setBindGroup(1, sourceBG);
  pass.setBindGroup(2, lutBG);
  pass.draw(6);
  pass.end();
}

function getLutBindGroupLayout(state: WgpuRenderState): GPUBindGroupLayout {
  let layout = lutBindGroupLayouts.get(state);
  if (layout === undefined) {
    layout = state.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '3d' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    lutBindGroupLayouts.set(state, layout);
  }
  return layout;
}

// A render pipeline's color target format must match the attachment it draws into, so an HDR
// (rgba16float) effect target needs its own variant; pipelines are cached per (state, dest format).
function getLutPipeline(state: WgpuRenderState, format: GPUTextureFormat): WgpuEffectPipeline {
  let byFormat = lutPipelines.get(state);
  if (byFormat === undefined) {
    byFormat = new Map();
    lutPipelines.set(state, byFormat);
  }
  let pipeline = byFormat.get(format);
  if (pipeline === undefined) {
    const fs = getWgpuEffectPassState(state);
    const { device } = state;
    const shaderModule = device.createShaderModule({ code: EFFECT_VERTEX_WGSL + COLOR_LUT_FRAGMENT_WGSL });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout, getLutBindGroupLayout(state)],
    });
    const gpuPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format, blend: REPLACE_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
    });
    pipeline = { pipeline: gpuPipeline, blendMode: 'replace' };
    byFormat.set(format, pipeline);
  }
  return pipeline;
}

// Uploads `lut` into a per-state reusable rgba8unorm 3D texture and returns it. The texture is recreated
// when the LUT size changes, otherwise re-written each call (the effect list is per-frame data, so the
// baked LUT can change every frame); caching by stack identity to skip the re-upload is a follow-up.
function uploadLutTexture(state: WgpuRenderState, lut: Readonly<ColorLut>): GPUTexture {
  const { device } = state;
  const n = lut.size;
  const samples = lut.samples;
  const data = new Uint8Array(n * n * n * 4);
  for (let i = 0, j = 0, o = 0; i < n * n * n; i++) {
    data[o++] = Math.round(clamp01(samples[j++]) * 255);
    data[o++] = Math.round(clamp01(samples[j++]) * 255);
    data[o++] = Math.round(clamp01(samples[j++]) * 255);
    data[o++] = 255;
  }
  let cached = lutTextures.get(state);
  if (cached === undefined || cached.size !== n) {
    cached?.texture.destroy();
    const texture = device.createTexture({
      size: [n, n, n],
      dimension: '3d',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    cached = { texture, size: n };
    lutTextures.set(state, cached);
  }
  device.queue.writeTexture({ texture: cached.texture }, data, { bytesPerRow: n * 4, rowsPerImage: n }, [n, n, n]);
  return cached.texture;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const REPLACE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
};

// Half-texel scale/offset maps the [0,1] color to LUT cell centres, so v=0 hits cell 0 and v=1 the last.
const COLOR_LUT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_size : f32, _p0 : f32, _p1 : f32, _p2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var lut : texture_3d<f32>;
@group(2) @binding(1) var lutSmp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let scale = (uni.u_size - 1.0) / uni.u_size;
  let offset = 0.5 / uni.u_size;
  let lc = clamp(c.rgb, vec3f(0.0), vec3f(1.0)) * scale + offset;
  let graded = textureSampleLevel(lut, lutSmp, lc, 0.0).rgb;
  return vec4f(graded, c.a);
}`;

const lutBindGroupLayouts = new WeakMap<WgpuRenderState, GPUBindGroupLayout>();
const lutPipelines = new WeakMap<WgpuRenderState, Map<GPUTextureFormat, WgpuEffectPipeline>>();
const lutTextures = new WeakMap<WgpuRenderState, { texture: GPUTexture; size: number }>();
