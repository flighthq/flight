import type { DitherEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Dither: quantize each channel to `levels` steps with a 4x4 ordered Bayer threshold for a retro
// banded-but-textured look.
export function applyDitherEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<DitherEffect>,
): void {
  const levels = effect.levels ?? 4;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.dither', DITHER_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(2, levels);
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

export const defaultWgpuDitherEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyDitherEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as DitherEffect);
};

// Slot layout: [0]=levels, [1]=pad, [2..3]=resolution.
const DITHER_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_levels : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn bayer(p : vec2i) -> f32 {
  let x = p.x & 3;
  let y = p.y & 3;
  var m = array<i32, 16>(0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return f32(m[y * 4 + x]) / 16.0;
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let px = vec2i(uv * uni.u_resolution);
  let t = bayer(px) - 0.5;
  let steps = uni.u_levels - 1.0;
  let q = floor(c.rgb * steps + 0.5 + t) / steps;
  return vec4f(clamp(q, vec3f(0.0), vec3f(1.0)), c.a);
}`;
