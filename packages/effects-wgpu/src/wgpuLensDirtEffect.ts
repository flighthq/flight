import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { LensDirtEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Lens dirt: procedural soft smudges that brighten where the scene is bright — a cheap bloom-dirt overlay.
export function applyLensDirtEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<LensDirtEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const threshold = effect.threshold ?? 0.55;
  const seed = effect.seed ?? 0;
  const pipeline = getWgpuEffectPipeline(state, 'lens.lensDirt', LENS_DIRT_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = threshold;
    f32[2] = seed;
  });
}

export const defaultWgpuLensDirtEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as LensDirtEffect);
};

// Slot layout: [0]=intensity, [1]=threshold, [2]=seed.
const LENS_DIRT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_threshold : f32,
  u_seed : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn dirtHash(p : vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123); }

fn dirtAmount(uv : vec2f, seed : f32) -> f32 {
  var acc = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let fi = f32(i);
    let c = vec2f(dirtHash(vec2f(fi, seed)), dirtHash(vec2f(fi + 9.0, seed)));
    let r = 0.06 + 0.16 * dirtHash(vec2f(fi + 3.0, seed));
    let d = distance(uv, c) / r;
    acc = acc + smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2f(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.299, 0.587, 0.114));
  let bright = max(0.0, lum - uni.u_threshold);
  let dirt = dirtAmount(uv, uni.u_seed + 1.0);
  return vec4f(c.rgb + bright * dirt * uni.u_intensity * 2.0, c.a);
}`;
