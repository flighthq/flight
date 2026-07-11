import type { ToneMapEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Tone map: compress HDR to displayable range via the selected operator. Single-pass reference recipe,
// the Wgpu mirror of effects-gl's applyToneMapEffectToGl. The operator selects a tonemap body
// that is compiled into the fragment once per state, keyed by operator name.
export function applyToneMapEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<ToneMapEffect>,
): void {
  const operator = effect.operator ?? 'aces';
  const exposure = effect.exposure ?? 1;
  const white = effect.white ?? 1;
  const pipeline = getWgpuEffectPipeline(state, `toneMap.${operator}`, buildToneMapFragment(operator), 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = exposure;
    f32[1] = white;
  });
}

export const defaultWgpuToneMapEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyToneMapEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ToneMapEffect);
};

function buildToneMapFragment(operator: string): string {
  return TONEMAP_FRAGMENT_HEAD + (TONEMAP_OPERATORS[operator] ?? TONEMAP_OPERATORS.aces) + TONEMAP_FRAGMENT_TAIL;
}

// Slots [0]=exposure, [1]=white; the operator body is spliced between head and tail. The struct's two
// scalars pad to a 16-byte boundary.
const TONEMAP_FRAGMENT_HEAD = /* wgsl */ `
struct Uniforms { u_exposure : f32, u_white : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn tonemap(x : vec3f) -> vec3f {`;

const TONEMAP_FRAGMENT_TAIL = /* wgsl */ `}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let mapped = tonemap(c.rgb * uni.u_exposure);
  return vec4f(clamp(mapped, vec3f(0.0), vec3f(1.0)), c.a);
}`;

const TONEMAP_OPERATORS: Record<string, string> = {
  aces: `
  let a = x * (2.51 * x + 0.03);
  let b = x * (2.43 * x + 0.59) + 0.14;
  return a / b;`,
  reinhard: `
  return x / (1.0 + x / (uni.u_white * uni.u_white));`,
  filmic: `
  let X = max(vec3f(0.0), x - 0.004);
  return (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);`,
  uncharted2: `
  let A = 0.15; let B = 0.50; let C = 0.10; let D = 0.20; let E = 0.02; let F = 0.30;
  let v = ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  return v;`,
  agx: `
  let v = clamp((x - 0.004) / (1.0 + x), vec3f(0.0), vec3f(1.0));
  return pow(v, vec3f(0.8));`,
};
