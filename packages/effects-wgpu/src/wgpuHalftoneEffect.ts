import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { HalftoneEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Halftone: sample luminance, then carve a rotated dot grid whose dot radius tracks darkness — the
// classic print/comic screen. `scale` sets the cell size, `angle` rotates the grid.
export function applyHalftoneEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<HalftoneEffect>,
): void {
  const scale = effect.scale ?? 6;
  const angle = effect.angle ?? 0.4;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.halftone', HALFTONE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(1, scale);
    f32[1] = angle;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

export const defaultWgpuHalftoneEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyHalftoneEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as HalftoneEffect);
};

// Slot layout: [0]=scale, [1]=angle, [2..3]=resolution.
const HALFTONE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_scale : f32,
  u_angle : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let p = uv * uni.u_resolution;
  let s = sin(uni.u_angle);
  let co = cos(uni.u_angle);
  let rp = vec2f(p.x * co - p.y * s, p.x * s + p.y * co);
  let cell = (rp % vec2f(uni.u_scale)) - uni.u_scale * 0.5;
  let dist = length(cell) / (uni.u_scale * 0.5);
  let radius = sqrt(1.0 - lum);
  let dot1 = step(dist, radius);
  return vec4f(c.rgb * dot1, c.a);
}`;
