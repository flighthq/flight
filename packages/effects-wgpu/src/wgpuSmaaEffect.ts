import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { SmaaEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// SMAA: a single-pass edge-aware blur approximation. Full SMAA needs separate edge-detection and
// blend-weight passes against precomputed area/search lookup textures; this single-pass approximation
// softens detected edges only and is acceptable until the multi-pass recipe lands.
export function applySmaaEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<SmaaEffect>,
): void {
  const threshold = effect.threshold ?? 0.1;
  const width = source.width;
  const height = source.height;
  const pipeline = getWgpuEffectPipeline(state, 'antialiasing.smaa', SMAA_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = width;
    f32[1] = height;
    f32[2] = threshold;
  });
}

export const defaultWgpuSmaaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applySmaaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as SmaaEffect);
};

// Slots [0..1]=resolution (vec2f), [2]=threshold; the trailing scalar fits in the same 16-byte block.
const SMAA_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_resolution : vec2f, u_threshold : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let center = textureSampleLevel(tex, smp, uv, 0.0);
  let lumaC = luma(center.rgb);
  let lumaL = luma(textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb);
  let lumaR = luma(textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb);
  let lumaT = luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb);
  let lumaB = luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb);
  let edge = max(abs(lumaC - lumaL), max(abs(lumaC - lumaR), max(abs(lumaC - lumaT), abs(lumaC - lumaB))));
  if (edge < uni.u_threshold) {
    return center;
  }
  let blurred = (
    textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb +
    center.rgb) / 5.0;
  return vec4f(blurred, center.a);
}`;
