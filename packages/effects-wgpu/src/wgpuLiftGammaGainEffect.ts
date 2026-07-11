import type { LiftGammaGainEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Lift/gamma/gain: unpack packed-RGBA neutrals to per-channel offsets/exponents/multipliers in JS.
// Neutral packed values: lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff. Each vec3 is uploaded
// into its own 16-byte-aligned slot so the std140 vec3 alignment is satisfied.
export function applyLiftGammaGainEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<LiftGammaGainEffect>,
): void {
  const lift = unpackColor(effect.lift ?? 0x000000ff);
  const gammaRaw = unpackColor(effect.gamma ?? 0x808080ff);
  const gain = unpackColor(effect.gain ?? 0xffffffff);
  // Map gamma's 0.5-neutral to a 1.0-neutral exponent so 0x808080 leaves the image unchanged.
  const gamma: readonly [number, number, number] = [
    1 / Math.max(gammaRaw[0] * 2, 1e-3),
    1 / Math.max(gammaRaw[1] * 2, 1e-3),
    1 / Math.max(gammaRaw[2] * 2, 1e-3),
  ];
  const pipeline = getWgpuEffectPipeline(state, 'colorGrade.liftGammaGain', LIFT_GAMMA_GAIN_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = lift[0];
    f32[1] = lift[1];
    f32[2] = lift[2];
    f32[4] = gamma[0];
    f32[5] = gamma[1];
    f32[6] = gamma[2];
    f32[8] = gain[0];
    f32[9] = gain[1];
    f32[10] = gain[2];
  });
}

export const defaultWgpuLiftGammaGainEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyLiftGammaGainEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as LiftGammaGainEffect);
};

// Unpack a packed RGBA integer (0xRRGGBBAA) into normalized [r, g, b] floats. Alpha is dropped — these
// grade values describe RGB channels only.
function unpackColor(c: number): readonly [number, number, number] {
  return [((c >>> 24) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255];
}

// Slot layout: three vec3 in 16-byte-aligned slots — [0..2]=lift, [4..6]=gamma, [8..10]=gain.
const LIFT_GAMMA_GAIN_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_lift : vec3f, u_gamma : vec3f, u_gain : vec3f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb * uni.u_gain + uni.u_lift * (vec3f(1.0) - c.rgb);
  rgb = pow(max(rgb, vec3f(0.0)), uni.u_gamma);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;
