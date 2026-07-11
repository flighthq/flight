import type { ChannelMixerEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Channel mixer: apply a 3x4 row-major RGB->RGB matrix plus per-row offset. The matrix is uploaded as
// three vec4f rows (r/g/b), each 16-byte aligned, so the std140 layout maps a row directly onto a slot.
export function applyChannelMixerEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ChannelMixerEffect>,
): void {
  const matrix = new Float32Array(12);
  for (let i = 0; i < 12; i++) matrix[i] = effect.matrix[i] ?? IDENTITY_CHANNEL_MIXER[i];
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.channelMixer', CHANNEL_MIXER_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    for (let i = 0; i < 12; i++) f32[i] = matrix[i];
  });
}

export const defaultWgpuChannelMixerEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyChannelMixerEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ChannelMixerEffect);
};

const IDENTITY_CHANNEL_MIXER: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

// Slot layout: three vec4f rows, each 16-byte aligned — [0..3]=row r, [4..7]=row g, [8..11]=row b.
const CHANNEL_MIXER_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_row_r : vec4f, u_row_g : vec4f, u_row_b : vec4f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let r = uni.u_row_r.x * c.r + uni.u_row_r.y * c.g + uni.u_row_r.z * c.b + uni.u_row_r.w;
  let g = uni.u_row_g.x * c.r + uni.u_row_g.y * c.g + uni.u_row_g.z * c.b + uni.u_row_g.w;
  let b = uni.u_row_b.x * c.r + uni.u_row_b.y * c.g + uni.u_row_b.z * c.b + uni.u_row_b.w;
  return vec4f(clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0)), c.a);
}`;
