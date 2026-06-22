import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { GrayscaleEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Grayscale: mix toward luminance by intensity.
export function applyGrayscaleEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<GrayscaleEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.grayscale', GRAYSCALE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
  });
}

export const defaultWgpuGrayscaleEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyGrayscaleEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as GrayscaleEffect);
};

// Slot layout: [0]=intensity.
const GRAYSCALE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let l = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  return vec4f(mix(c.rgb, vec3f(l), uni.u_intensity), c.a);
}`;
