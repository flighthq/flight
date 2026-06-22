import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type {
  FxaaEffect,
  SmaaEffect,
  TaaEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

import { getWgpuEffectPipeline } from './effectProgramCache';

// Anti-aliasing recipes, the Wgpu mirror of effects-gl's antialiasingEffects. FXAA is a full
// luminance-based single-pass implementation; SMAA is a single-pass edge-aware approximation; TAA is a
// passthrough placeholder. Each samples `tex` and, where it reads neighbors, takes the source
// dimensions in `u_resolution` to size the texel step (textureDimensions would also work, but passing
// the resolution keeps the texel math explicit and matches the Gl recipe).

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
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = width;
    f32[1] = height;
    f32[2] = edgeThreshold;
  });
}

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

// TAA: passthrough copy of source → dest. Real temporal AA needs a history buffer + motion vectors to
// reproject and accumulate prior frames; neither is available in the single-frame effect context, so
// this is a placeholder that preserves the pipeline stage without altering the image.
export function applyTaaEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  _effect: Readonly<TaaEffect>,
): void {
  const pipeline = getWgpuEffectPipeline(state, 'antialiasing.taa', TAA_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, _noopSetUniforms);
}

export const defaultWgpuFxaaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyFxaaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as FxaaEffect);
};

export const defaultWgpuSmaaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applySmaaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as SmaaEffect);
};

export const defaultWgpuTaaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyTaaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as TaaEffect);
};

function _noopSetUniforms(): void {}

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

// TAA has no parameters, but the filter pass always binds a uniform buffer at group(0); the struct is
// declared and read (× 1.0) so the binding stays live and the bind-group layout matches.
const TAA_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { _pad0 : f32, _pad1 : f32, _pad2 : f32, _pad3 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(c.rgb, c.a + uni._pad0 * 0.0);
}`;
