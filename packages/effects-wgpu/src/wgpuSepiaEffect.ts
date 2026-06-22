import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { SepiaEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Sepia: mix toward a sepia matrix transform by intensity.
export function applySepiaEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<SepiaEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.sepia', SEPIA_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
  });
}

export const defaultWgpuSepiaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applySepiaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as SepiaEffect);
};

// Slot layout: [0]=intensity.
const SEPIA_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let sepia = vec3f(
    dot(c.rgb, vec3f(0.393, 0.769, 0.189)),
    dot(c.rgb, vec3f(0.349, 0.686, 0.168)),
    dot(c.rgb, vec3f(0.272, 0.534, 0.131))
  );
  return vec4f(mix(c.rgb, sepia, uni.u_intensity), c.a);
}`;
