import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type {
  ChromaticAberrationEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Chromatic aberration: sample the R/G/B channels at progressively larger offsets so colors fringe
// apart. When radial, the offset scales with distance from the optical center (true lens behavior);
// otherwise it is a uniform horizontal split.
export function applyChromaticAberrationEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ChromaticAberrationEffect>,
): void {
  const intensity = effect.intensity ?? 0.005;
  const radial = effect.radial ?? true;
  const pipeline = getWgpuEffectPipeline(
    state,
    'lens.chromaticAberration',
    CHROMATIC_ABERRATION_FRAGMENT_WGSL,
    'replace',
  );
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = radial ? 1 : 0;
  });
}

export const defaultWgpuChromaticAberrationEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyChromaticAberrationEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ChromaticAberrationEffect);
};

// Slot layout: [0]=intensity, [1]=radial flag (1.0/0.0).
const CHROMATIC_ABERRATION_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_radial : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let centered = uv - vec2f(0.5);
  let scale = mix(1.0, length(centered) * 2.0, uni.u_radial);
  let dir = mix(vec2f(1.0, 0.0), normalize(centered + vec2f(1e-5)), uni.u_radial);
  let offset = dir * uni.u_intensity * scale;
  let r = textureSampleLevel(tex, smp, uv + offset, 0.0).r;
  let g = textureSampleLevel(tex, smp, uv, 0.0).g;
  let b = textureSampleLevel(tex, smp, uv - offset, 0.0).b;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(r, g, b, a);
}`;
