import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { LensDistortionEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Lens distortion: remap uv by a radial polynomial. Positive amount bulges outward (barrel), negative
// pinches inward (pincushion); scale re-frames the result so corners stay in view.
export function applyLensDistortionEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<LensDistortionEffect>,
): void {
  const amount = effect.amount ?? 0.2;
  const scale = effect.scale ?? 1;
  const pipeline = getWgpuEffectPipeline(state, 'lens.lensDistortion', LENS_DISTORTION_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = amount;
    f32[1] = scale;
  });
}

export const defaultWgpuLensDistortionEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyLensDistortionEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as LensDistortionEffect);
};

const LENS_DISTORTION_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_amount : f32,
  u_scale : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let centered = (uv - vec2f(0.5)) / uni.u_scale;
  let r2 = dot(centered, centered);
  let distorted = centered * (1.0 + uni.u_amount * r2) + vec2f(0.5);
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  return textureSampleLevel(tex, smp, distorted, 0.0);
}`;
