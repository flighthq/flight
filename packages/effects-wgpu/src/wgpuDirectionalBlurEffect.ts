import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { DirectionalBlurEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Directional blur: accumulate samples stepped along `angle` over `length` texels, normalized by the
// sample count. Single-pass reference recipe, the Wgpu mirror of effects-gl's
// applyDirectionalBlurEffectToGl. u_resolution converts the texel length into UV space.
export function applyDirectionalBlurEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<DirectionalBlurEffect>,
): void {
  const angle = effect.angle ?? 0;
  const length = effect.length ?? 8;
  const samples = effect.samples ?? 16;
  const pipeline = getWgpuEffectPipeline(state, 'motion.directionalBlur', DIRECTIONAL_BLUR_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = angle;
    f32[1] = length;
    f32[2] = samples;
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

export const defaultWgpuDirectionalBlurEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyDirectionalBlurEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as DirectionalBlurEffect);
};

// Slot layout: [0]=angle, [1]=length, [2]=samples, [3]=pad, [4]=resolution.x, [5]=resolution.y.
const DIRECTIONAL_BLUR_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_angle : f32,
  u_length : f32,
  u_samples : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let dir = vec2f(cos(uni.u_angle), sin(uni.u_angle)) * (uni.u_length / uni.u_resolution);
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, (f32(i) / (count - 1.0)) - 0.5, count > 1.0);
    let p = uv + dir * t;
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}`;
