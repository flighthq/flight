import type {
  BrightnessContrastEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Brightness/contrast: shift then scale about mid-grey.
export function applyBrightnessContrastEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<BrightnessContrastEffect>,
): void {
  const brightness = effect.brightness ?? 0;
  const contrast = effect.contrast ?? 1;
  const pipeline = getWgpuEffectPipeline(
    state,
    'colorGrade.brightnessContrast',
    BRIGHTNESS_CONTRAST_FRAGMENT_WGSL,
    'replace',
  );
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = brightness;
    f32[1] = contrast;
  });
}

export const defaultWgpuBrightnessContrastEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyBrightnessContrastEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as BrightnessContrastEffect);
};

// Slot layout: [0]=brightness, [1]=contrast.
const BRIGHTNESS_CONTRAST_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_brightness : f32, u_contrast : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let rgb = (c.rgb + uni.u_brightness - 0.5) * uni.u_contrast + 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;
