import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { ColorGradeEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Color grade: combined exposure, brightness, contrast, saturation, and temperature/tint shift.
export function applyColorGradeEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ColorGradeEffect>,
): void {
  const exposure = Math.pow(2, effect.exposure ?? 0);
  const contrast = effect.contrast ?? 1;
  const saturation = effect.saturation ?? 1;
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const brightness = effect.brightness ?? 0;
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.colorGrade', COLOR_GRADE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = exposure;
    f32[1] = contrast;
    f32[2] = saturation;
    f32[3] = temperature;
    f32[4] = tint;
    f32[5] = brightness;
  });
}

export const defaultWgpuColorGradeEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyColorGradeEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ColorGradeEffect);
};

// Slot layout: [0]=exposure, [1]=contrast, [2]=saturation, [3]=temperature, [4]=tint, [5]=brightness.
const COLOR_GRADE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_exposure : f32,
  u_contrast : f32,
  u_saturation : f32,
  u_temperature : f32,
  u_tint : f32,
  u_brightness : f32,
  _pad0 : f32,
  _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb * uni.u_exposure + uni.u_brightness;
  rgb.r += uni.u_temperature * 0.5;
  rgb.b -= uni.u_temperature * 0.5;
  rgb.g += uni.u_tint * 0.5;
  let l = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3f(l), rgb, uni.u_saturation);
  rgb = (rgb - 0.5) * uni.u_contrast + 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;
