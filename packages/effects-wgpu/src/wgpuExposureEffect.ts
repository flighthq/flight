import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { ExposureEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Exposure: scale linear color by 2^stops. Single-pass reference recipe, the Wgpu mirror of
// effects-gl's applyExposureEffectToGl. The stops are converted to a linear multiplier in JS.
export function applyExposureEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ExposureEffect>,
): void {
  const exposure = effect.exposure ?? 0;
  const multiplier = Math.pow(2, exposure);
  const pipeline = getWgpuEffectPipeline(state, 'exposure', EXPOSURE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = multiplier;
  });
}

export const defaultWgpuExposureEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyExposureEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ExposureEffect);
};

// Slot [0]=multiplier (2^stops, precomputed in JS); the scalar struct pads to a 16-byte boundary.
const EXPOSURE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_exposure : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(c.rgb * uni.u_exposure, c.a);
}`;
