import type { CrtEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// CRT: barrel-distort the uv (curvature), darken alternating scanlines, vignette the edges, and split
// the channels outward (chromatic aberration) for a tube-monitor look.
export function applyCrtEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<CrtEffect>,
): void {
  const curvature = effect.curvature ?? 0.1;
  const scanlineIntensity = effect.scanlineIntensity ?? 0.3;
  const vignette = effect.vignette ?? 0.3;
  const aberration = effect.aberration ?? 0.005;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.crt', CRT_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = curvature;
    f32[1] = scanlineIntensity;
    f32[2] = vignette;
    f32[3] = aberration;
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

export const defaultWgpuCrtEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyCrtEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as CrtEffect);
};

// Slot layout: [0]=curvature, [1]=scanlineIntensity, [2]=vignette, [3]=aberration, [4..5]=resolution.
const CRT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_curvature : f32,
  u_scanlineIntensity : f32,
  u_vignette : f32,
  u_aberration : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn barrel(uv : vec2f) -> vec2f {
  var c = uv * 2.0 - 1.0;
  c += c * uni.u_curvature * dot(c, c);
  return c * 0.5 + 0.5;
}

@fragment
fn fs_main(@location(0) uvIn : vec2f) -> @location(0) vec4f {
  let uv = barrel(uvIn);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let off = vec2f(uni.u_aberration, 0.0);
  let r = textureSampleLevel(tex, smp, uv + off, 0.0).r;
  let g = textureSampleLevel(tex, smp, uv, 0.0).g;
  let b = textureSampleLevel(tex, smp, uv - off, 0.0).b;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  var col = vec3f(r, g, b);
  let line = sin(uv.y * uni.u_resolution.y * 3.14159265) * 0.5 + 0.5;
  col *= 1.0 - uni.u_scanlineIntensity * (1.0 - line);
  let vc = uv * 2.0 - 1.0;
  col *= 1.0 - uni.u_vignette * dot(vc, vc);
  return vec4f(col, a);
}`;
