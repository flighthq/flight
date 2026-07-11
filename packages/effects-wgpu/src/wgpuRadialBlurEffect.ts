import type { RadialBlurEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Radial blur: accumulate samples stepped from the current uv toward (centerX, centerY) scaled by
// `strength`, normalized by the sample count. Single-pass reference recipe, the Wgpu mirror of
// effects-gl's applyRadialBlurEffectToGl.
export function applyRadialBlurEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<RadialBlurEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const strength = effect.strength ?? 0.2;
  const samples = effect.samples ?? 16;
  const pipeline = getWgpuEffectPipeline(state, 'motion.radialBlur', RADIAL_BLUR_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = centerX;
    f32[1] = centerY;
    f32[2] = strength;
    f32[3] = samples;
  });
}

export const defaultWgpuRadialBlurEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyRadialBlurEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as RadialBlurEffect);
};

// Slot layout: [0]=center.x, [1]=center.y, [2]=strength, [3]=samples.
const RADIAL_BLUR_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_center : vec2f,
  u_strength : f32,
  u_samples : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let toCenter = uni.u_center - uv;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, f32(i) / (count - 1.0), count > 1.0);
    let p = uv + toCenter * (t * uni.u_strength);
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}`;
