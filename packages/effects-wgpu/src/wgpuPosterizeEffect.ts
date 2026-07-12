import type { PosterizeEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Posterize: floor each channel to `levels` discrete steps.
export function applyPosterizeEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<PosterizeEffect>,
): void {
  const levels = Math.max(2, effect.levels ?? 8);
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.posterize', POSTERIZE_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = levels;
  });
}

export const defaultWgpuPosterizeEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyPosterizeEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as PosterizeEffect);
};

// Slot layout: [0]=levels.
const POSTERIZE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_levels : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let rgb = floor(c.rgb * uni.u_levels) / (uni.u_levels - 1.0);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;
