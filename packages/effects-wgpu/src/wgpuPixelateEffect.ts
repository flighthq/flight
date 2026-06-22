import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { PixelateEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Pixelate: snap uv to the center of `size`-pixel blocks before sampling, producing hard mosaic blocks.
export function applyPixelateEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<PixelateEffect>,
): void {
  const size = effect.size ?? 8;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.pixelate', PIXELATE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(1, size);
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

export const defaultWgpuPixelateEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyPixelateEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as PixelateEffect);
};

// Slot layout: [0]=size, [1]=pad, [2..3]=resolution.
const PIXELATE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_size : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uvIn : vec2f) -> @location(0) vec4f {
  let blocks = uni.u_resolution / uni.u_size;
  let uv = (floor(uvIn * blocks) + 0.5) / blocks;
  return textureSampleLevel(tex, smp, uv, 0.0);
}`;
