import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { VignetteEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Vignette: darken toward the edges. Pixels inside `radius` stay full bright; beyond it, brightness
// falls off over `softness` and the color is blended toward the (unpacked) vignette color by intensity.
// Single-pass reference recipe, the Wgpu mirror of effects-gl's applyVignetteEffectToGl. The
// fragment works in centered coordinates (uv - 0.5) so radial math measures distance from the center;
// the packed RGBA color int is unpacked to normalized components in JS before upload.
export function applyVignetteEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<VignetteEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const radius = effect.radius ?? 0.75;
  const softness = effect.softness ?? 0.45;
  const color = effect.color ?? 0x000000ff;
  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const a = (color & 0xff) / 255;
  const pipeline = getWgpuEffectPipeline(state, 'lens.vignette', VIGNETTE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = radius;
    f32[2] = softness;
    f32[4] = r;
    f32[5] = g;
    f32[6] = b;
    f32[7] = a;
  });
}

export const defaultWgpuVignetteEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyVignetteEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as VignetteEffect);
};

// Slot layout: [0]=intensity, [1]=radius, [2]=softness, [3]=pad, [4..7]=color rgba. The std140-style
// struct aligns the vec4 color to a 16-byte boundary, so the JS writes skip slot [3].
const VIGNETTE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_radius : f32,
  u_softness : f32,
  _pad0 : f32,
  u_color : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let centered = uv - vec2f(0.5);
  let dist = length(centered) * 1.41421356;
  let vig = smoothstep(uni.u_radius, uni.u_radius - uni.u_softness, dist);
  let darken = (1.0 - vig) * uni.u_intensity * uni.u_color.a;
  return vec4f(mix(c.rgb, uni.u_color.rgb, darken), c.a);
}`;
