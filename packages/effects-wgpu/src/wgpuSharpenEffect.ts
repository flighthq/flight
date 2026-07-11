import type { SharpenEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Sharpen: unsharp mask via a 3x3 Laplacian kernel; `amount` scales the high-frequency boost.
export function applySharpenEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<SharpenEffect>,
): void {
  const amount = effect.amount ?? 0.5;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.sharpen', SHARPEN_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = amount;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

export const defaultWgpuSharpenEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applySharpenEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as SharpenEffect);
};

// Slot layout: [0]=amount, [1]=pad, [2..3]=resolution.
const SHARPEN_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_amount : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let c = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let n = textureSampleLevel(tex, smp, uv + vec2f(0.0, -texel.y), 0.0).rgb;
  let s = textureSampleLevel(tex, smp, uv + vec2f(0.0, texel.y), 0.0).rgb;
  let e = textureSampleLevel(tex, smp, uv + vec2f(texel.x, 0.0), 0.0).rgb;
  let w = textureSampleLevel(tex, smp, uv + vec2f(-texel.x, 0.0), 0.0).rgb;
  let high = c * 4.0 - n - s - e - w;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(clamp(c + high * uni.u_amount, vec3f(0.0), vec3f(1.0)), a);
}`;
