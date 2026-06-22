import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { GodRaysEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// God rays: radial light scattering from a screen-space light position (centerX, centerY). Marches
// SAMPLES steps along the ray from each fragment toward the light, accumulating color with per-step
// decay and weight, then scales by exposure. A true single-pass recipe — no depth needed. The sample
// count is baked into the WGSL (loop bound must be const) and keyed into the pipeline cache, so each
// distinct sample count compiles once.
export function applyGodRaysEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<GodRaysEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const density = effect.density ?? 0.96;
  const decay = effect.decay ?? 0.93;
  const weight = effect.weight ?? 0.4;
  const exposure = effect.exposure ?? 0.6;
  const samples = Math.max(1, Math.round(effect.samples ?? 64));
  const pipeline = getWgpuEffectPipeline(
    state,
    `atmospheric.godRays.${samples}`,
    buildGodRaysFragment(samples),
    'replace',
  );
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = centerX;
    f32[1] = centerY;
    f32[2] = density;
    f32[3] = decay;
    f32[4] = weight;
    f32[5] = exposure;
  });
}

export const defaultWgpuGodRaysEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyGodRaysEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as GodRaysEffect);
};

function buildGodRaysFragment(samples: number): string {
  return GOD_RAYS_FRAGMENT_HEAD + samples.toString() + GOD_RAYS_FRAGMENT_TAIL;
}

// Slot layout: [0]=centerX, [1]=centerY, [2]=density, [3]=decay, [4]=weight, [5]=exposure. All scalars
// pack into one vec4-aligned run, so no padding gaps are needed.
const GOD_RAYS_FRAGMENT_HEAD = /* wgsl */ `
struct Uniforms {
  u_centerX : f32,
  u_centerY : f32,
  u_density : f32,
  u_decay : f32,
  u_weight : f32,
  u_exposure : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = `;

const GOD_RAYS_FRAGMENT_TAIL = `;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let light = vec2f(uni.u_centerX, uni.u_centerY);
  let delta = (uv - light) * (uni.u_density / f32(SAMPLES));
  var coord = uv;
  let base = textureSampleLevel(tex, smp, uv, 0.0);
  var accum = base.rgb;
  var illumination = 1.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    coord = coord - delta;
    var s = textureSampleLevel(tex, smp, coord, 0.0).rgb;
    s = s * (illumination * uni.u_weight);
    accum = accum + s;
    illumination = illumination * uni.u_decay;
  }
  return vec4f(base.rgb + accum * uni.u_exposure, base.a);
}`;
