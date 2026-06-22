import { drawWgpuFilterPass } from '@flighthq/filters-wgpu';
import type { GlitchEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Glitch: split the frame into horizontal blocks, displace each by a per-block hash (data-mosh tear),
// separate the RGB channels, and corrupt the occasional block to white. `seed` animates it.
export function applyGlitchEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<GlitchEffect>,
): void {
  const intensity = effect.intensity ?? 0.5;
  const blockSize = effect.blockSize ?? 24;
  const colorShift = effect.colorShift ?? 8;
  const seed = effect.seed ?? 0;
  const pipeline = getWgpuEffectPipeline(state, 'stylization.glitch', GLITCH_FRAGMENT_WGSL, 'replace');
  drawWgpuFilterPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = blockSize;
    f32[2] = colorShift;
    f32[3] = seed;
    // u_resolution (vec2f) aligns to slot [4].
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

export const defaultWgpuGlitchEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyGlitchEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as GlitchEffect);
};

// Slot layout: [0]=intensity, [1]=blockSize, [2]=colorShift, [3]=seed, [4..5]=resolution.
const GLITCH_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_intensity : f32,
  u_blockSize : f32,
  u_colorShift : f32,
  u_seed : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn glitchHash(n : f32) -> f32 { return fract(sin(n) * 43758.5453123); }

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let blockSize = max(2.0, uni.u_blockSize);
  let block = floor(uv.y * uni.u_resolution.y / blockSize);
  let r = glitchHash(block + uni.u_seed * 7.0);
  // Higher intensity activates more blocks; a torn block tears horizontally.
  let tear = step(1.0 - uni.u_intensity * 0.6, r);
  let shiftPx = (glitchHash(block * 1.7 + uni.u_seed) - 0.5) * 2.0 * tear * uni.u_intensity * 40.0;
  let baseUv = vec2f(uv.x + shiftPx / uni.u_resolution.x, uv.y);
  // RGB channel separation, wider on torn blocks.
  let cs = (uni.u_colorShift * (0.4 + tear)) / uni.u_resolution.x;
  let rC = textureSampleLevel(tex, smp, vec2f(baseUv.x + cs, baseUv.y), 0.0).r;
  let gC = textureSampleLevel(tex, smp, baseUv, 0.0).g;
  let bC = textureSampleLevel(tex, smp, vec2f(baseUv.x - cs, baseUv.y), 0.0).b;
  let a = textureSampleLevel(tex, smp, baseUv, 0.0).a;
  var col = vec3f(rC, gC, bC);
  // Occasional bright block corruption.
  let corrupt = step(0.985 - uni.u_intensity * 0.04, glitchHash(block * 3.3 + uni.u_seed * 2.0));
  col = mix(col, vec3f(1.0), corrupt * 0.6);
  return vec4f(col, a);
}`;
