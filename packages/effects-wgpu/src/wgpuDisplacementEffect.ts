import type { DisplacementEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Displacement / heat-haze: warp the sample uv by an animated sine field for a refractive wobble.
export function applyDisplacementEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<DisplacementEffect>,
): void {
  const intensity = effect.intensity ?? 8;
  const frequency = effect.frequency ?? 12;
  const seed = effect.seed ?? 0;
  const pipeline = getWgpuEffectPipeline(state, 'lens.displacement', DISPLACEMENT_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = frequency;
    f32[2] = seed;
    // u_resolution (vec2f) aligns to slot [4].
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

export const defaultWgpuDisplacementEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyDisplacementEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as DisplacementEffect);
};

// Slot layout: [0]=amount, [1]=scale.
// Slot layout: [0]=intensity, [1]=frequency, [2]=seed, [4..5]=resolution.
const DISPLACEMENT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_frequency : f32,
  u_seed : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let f = uni.u_frequency;
  let warp = vec2f(
    sin(uv.y * f + uni.u_seed) + sin(uv.y * f * 2.3 + uni.u_seed * 1.7) * 0.5,
    cos(uv.x * f * 0.8 + uni.u_seed * 1.3)
  );
  let displaced = uv + warp * (uni.u_intensity / uni.u_resolution);
  return textureSampleLevel(tex, smp, displaced, 0.0);
}`;
