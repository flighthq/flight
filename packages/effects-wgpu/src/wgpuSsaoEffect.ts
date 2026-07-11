import type { SsaoEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// SSAO: ambient-occlusion approximation. Real SSAO reconstructs view-space position/normals from a
// sampleable DEPTH texture and accumulates occlusion over `samples` kernel offsets within `radius`,
// gated by `bias`; Wgpu has no depth G-buffer yet, so none of that data exists. This stand-in darkens
// fragments by local luminance variation (high-contrast neighborhoods read as creases/contact) scaled
// by intensity, sampling neighbors via u_resolution-derived texel steps.
export function applySsaoEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<SsaoEffect>,
): void {
  const radius = effect.radius ?? 1;
  const intensity = effect.intensity ?? 1;
  const pipeline = getWgpuEffectPipeline(state, 'atmospheric.ssao', SSAO_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = radius;
    f32[1] = intensity;
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

export const defaultWgpuSsaoEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applySsaoEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as SsaoEffect);
};

// Slot layout: [0]=radius, [1]=intensity, [2]=resolution.x, [3]=resolution.y.
const SSAO_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_radius : f32,
  u_intensity : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = (1.0 / uni.u_resolution) * max(uni.u_radius, 1.0);
  let center = textureSampleLevel(tex, smp, uv, 0.0);
  let lc = luma(center.rgb);
  var variation = 0.0;
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb));
  variation = variation * 0.25;
  let occlusion = clamp(variation * uni.u_intensity, 0.0, 1.0);
  return vec4f(center.rgb * (1.0 - occlusion), center.a);
}`;
