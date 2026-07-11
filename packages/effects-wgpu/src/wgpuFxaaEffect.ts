import type { FxaaEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// FXAA: luminance edge detection + directional blend along the detected edge. Single-pass reference
// recipe. Reads `tex`; u_resolution gives the texel size; u_edgeThreshold gates edge detection.
export function applyFxaaEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<FxaaEffect>,
): void {
  const edgeThreshold = effect.edgeThreshold ?? 0.0312;
  const width = source.width;
  const height = source.height;
  const pipeline = getWgpuEffectPipeline(state, 'antialiasing.fxaa', FXAA_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = width;
    f32[1] = height;
    f32[2] = edgeThreshold;
  });
}

export const defaultWgpuFxaaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyFxaaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as FxaaEffect);
};

// Slots [0..1]=resolution (vec2f), [2]=edgeThreshold; the trailing scalar fits in the same 16-byte block.
const FXAA_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_resolution : vec2f, u_edgeThreshold : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let rgbM = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let rgbNW = textureSampleLevel(tex, smp, uv + vec2f(-1.0, -1.0) * texel, 0.0).rgb;
  let rgbNE = textureSampleLevel(tex, smp, uv + vec2f(1.0, -1.0) * texel, 0.0).rgb;
  let rgbSW = textureSampleLevel(tex, smp, uv + vec2f(-1.0, 1.0) * texel, 0.0).rgb;
  let rgbSE = textureSampleLevel(tex, smp, uv + vec2f(1.0, 1.0) * texel, 0.0).rgb;
  let lumaM = luma(rgbM);
  let lumaNW = luma(rgbNW);
  let lumaNE = luma(rgbNE);
  let lumaSW = luma(rgbSW);
  let lumaSE = luma(rgbSE);
  let lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  let lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  let range = lumaMax - lumaMin;
  if (range < max(uni.u_edgeThreshold, lumaMax * 0.125)) {
    return vec4f(rgbM, textureSampleLevel(tex, smp, uv, 0.0).a);
  }
  var dir : vec2f;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  let dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
  let rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2f(-8.0), vec2f(8.0)) * texel;
  let rgbA = 0.5 * (
    textureSampleLevel(tex, smp, uv + dir * (1.0 / 3.0 - 0.5), 0.0).rgb +
    textureSampleLevel(tex, smp, uv + dir * (2.0 / 3.0 - 0.5), 0.0).rgb);
  let rgbB = rgbA * 0.5 + 0.25 * (
    textureSampleLevel(tex, smp, uv + dir * -0.5, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + dir * 0.5, 0.0).rgb);
  let lumaB = luma(rgbB);
  let result = select(rgbB, rgbA, lumaB < lumaMin || lumaB > lumaMax);
  return vec4f(result, textureSampleLevel(tex, smp, uv, 0.0).a);
}`;
