import type { WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget, WhiteBalanceEffect } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// White balance: warm/cool temperature and magenta/green tint channel shift.
export function applyWhiteBalanceEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<WhiteBalanceEffect>,
): void {
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.whiteBalance', WHITE_BALANCE_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = temperature;
    f32[1] = tint;
  });
}

export const defaultWgpuWhiteBalanceEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyWhiteBalanceEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as WhiteBalanceEffect);
};

// Slot layout: [0]=temperature, [1]=tint.
const WHITE_BALANCE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_temperature : f32, u_tint : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb;
  rgb.r += uni.u_temperature * 0.5;
  rgb.b -= uni.u_temperature * 0.5;
  rgb.g += uni.u_tint * 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;
