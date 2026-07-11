import type { ScanlinesEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Scanlines: darken by a vertical sine band; `count` sets the line density, `intensity` the darkening.
export function applyScanlinesEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ScanlinesEffect>,
): void {
  const count = effect.count ?? 240;
  const intensity = effect.intensity ?? 0.3;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.scanlines', SCANLINES_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = count;
    f32[1] = intensity;
  });
}

export const defaultWgpuScanlinesEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyScanlinesEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ScanlinesEffect);
};

// Slot layout: [0]=count, [1]=intensity.
const SCANLINES_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_count : f32,
  u_intensity : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let line = sin(uv.y * uni.u_count * 3.14159265) * 0.5 + 0.5;
  return vec4f(c.rgb * (1.0 - uni.u_intensity * (1.0 - line)), c.a);
}`;
