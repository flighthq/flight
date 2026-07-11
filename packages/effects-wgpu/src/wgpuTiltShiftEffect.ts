import type { TiltShiftEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Tilt-shift: keep a horizontal focus band sharp and blur above and below it. The band is centered at
// `center` on Y with height `width`; blur strength ramps with distance outside the band. Blur is
// approximated by averaging a few neighbor taps using the pixel size from the resolution uniform.
export function applyTiltShiftEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<TiltShiftEffect>,
): void {
  const center = effect.center ?? 0.5;
  const width = effect.width ?? 0.3;
  const blur = effect.blur ?? 4;
  const pipeline = getWgpuEffectPipeline(state, 'lens.tiltShift', TILT_SHIFT_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = center;
    f32[1] = width;
    f32[2] = blur;
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

export const defaultWgpuTiltShiftEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyTiltShiftEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as TiltShiftEffect);
};

// Slot layout: [0]=center, [1]=width, [2]=blur, [3]=pad, [4..5]=resolution (vec2 aligned to 16 bytes).
const TILT_SHIFT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_center : f32,
  u_width : f32,
  u_blur : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = vec2f(1.0) / uni.u_resolution;
  let dist = abs(uv.y - uni.u_center);
  let edge = uni.u_width * 0.5;
  let amount = smoothstep(edge, edge + uni.u_width, dist);
  let radius = amount * uni.u_blur;
  var sum = vec4f(0.0);
  var total = 0.0;
  for (var i = -3; i <= 3; i = i + 1) {
    let offset = vec2f(0.0, f32(i)) * radius * texel;
    sum = sum + textureSampleLevel(tex, smp, uv + offset, 0.0);
    total = total + 1.0;
  }
  return sum / total;
}`;
