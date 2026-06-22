import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { LensFlareEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Lens flare: a single-pass approximation. A true flare is a multi-pass recipe (downsample a bright
// pass, then accumulate ghosts and a halo from it). Here, on each fragment, we sample the source's
// bright spots along the vector from the pixel toward the center, adding `ghosts` evenly spaced ghost
// samples plus a halo ring, scaled by threshold/intensity. It previews the look without the bright-pass
// buffer.
export function applyLensFlareEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<LensFlareEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const ghosts = effect.ghosts ?? 4;
  const halo = effect.halo ?? 0.5;
  const pipeline = getWgpuEffectPipeline(state, 'lens.lensFlare', LENS_FLARE_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = threshold;
    f32[1] = intensity;
    f32[2] = ghosts;
    f32[3] = halo;
  });
}

export const defaultWgpuLensFlareEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyLensFlareEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as LensFlareEffect);
};

// Slot layout: [0]=threshold, [1]=intensity, [2]=ghosts, [3]=halo.
const LENS_FLARE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_threshold : f32,
  u_intensity : f32,
  u_ghosts : f32,
  u_halo : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn brightPass(uv : vec2f) -> vec3f {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec3f(0.0); }
  let c = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  return c * max(0.0, l - uni.u_threshold);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(tex, smp, uv, 0.0);
  // Single-pass approximation of a flare: walk ghost samples along the vector toward the optical
  // center and add a halo ring, all from the bright pass of the scene itself (no separate buffer).
  let toCenter = vec2f(0.5) - uv;
  var flare = vec3f(0.0);
  let count = i32(clamp(uni.u_ghosts, 0.0, 8.0));
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= count) { break; }
    let t = (f32(i) + 1.0) / (f32(count) + 1.0);
    let ghostUv = uv + toCenter * (2.0 * t);
    flare = flare + brightPass(ghostUv);
  }
  let haloDir = normalize(toCenter + vec2f(1e-5));
  flare = flare + brightPass(uv + haloDir * uni.u_halo) * uni.u_halo;
  return vec4f(scene.rgb + flare * uni.u_intensity, scene.a);
}`;
