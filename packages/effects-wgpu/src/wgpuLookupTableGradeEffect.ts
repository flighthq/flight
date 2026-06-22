import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type {
  LookupTableGradeEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// LUT grade: passthrough with a strength mix. A real 3D LUT grade needs an uploaded LUT cube texture
// (size from effect.size) sampled per pixel as an extra bound texture; that texture path is not yet
// wired, so this keeps the pass compiling and color-neutral until the LUT upload is added.
export function applyLookupTableGradeEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<LookupTableGradeEffect>,
): void {
  const strength = effect.strength ?? 1;
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.lutGrade', LUT_GRADE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = strength;
  });
}

export const defaultWgpuLookupTableGradeEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyLookupTableGradeEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as LookupTableGradeEffect);
};

// Slot layout: [0]=strength.
const LUT_GRADE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_strength : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  // Passthrough: a real 3D LUT samples an uploaded LUT cube texture here, then mixes by u_strength.
  let graded = c.rgb;
  return vec4f(mix(c.rgb, graded, uni.u_strength), c.a);
}`;
