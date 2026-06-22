import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { FilmGrainEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Film grain: add per-pixel hash noise scaled by intensity, with grain cell size and a seed so the
// noise can be animated frame to frame.
export function applyFilmGrainEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<FilmGrainEffect>,
): void {
  const intensity = effect.intensity ?? 0.1;
  const size = effect.size ?? 1;
  const seed = effect.seed ?? 0;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.filmGrain', FILM_GRAIN_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = Math.max(0.0001, size);
    f32[2] = seed;
  });
}

export const defaultWgpuFilmGrainEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyFilmGrainEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as FilmGrainEffect);
};

// Slot layout: [0]=intensity, [1]=size, [2]=seed.
const FILM_GRAIN_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_size : f32,
  u_seed : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn hash(pIn : vec2f) -> f32 {
  let p = floor(pIn / uni.u_size);
  return fract(sin(dot(p, vec2f(127.1, 311.7)) + uni.u_seed) * 43758.5453123);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let n = hash(uv * 1024.0) - 0.5;
  return vec4f(c.rgb + n * uni.u_intensity, c.a);
}`;
