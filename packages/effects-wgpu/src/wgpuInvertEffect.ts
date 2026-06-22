import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { InvertEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Invert: mix toward 1 - rgb by intensity.
export function applyInvertEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<InvertEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.invert', INVERT_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
  });
}

export const defaultWgpuInvertEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyInvertEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as InvertEffect);
};

// Slot layout: [0]=intensity.
const INVERT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(mix(c.rgb, vec3f(1.0) - c.rgb, uni.u_intensity), c.a);
}`;
