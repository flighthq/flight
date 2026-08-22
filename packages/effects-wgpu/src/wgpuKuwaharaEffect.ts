import type {
  KuwaharaEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types/contract';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';
import { getWgpuEffectLogicalResolution } from './wgpuEffectTexelScale';
import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';

// Kuwahara: edge-preserving smoothing. Over a fixed small radius split the neighborhood into four
// overlapping quadrants, compute each mean and variance, and emit the lowest-variance mean — flattens
// regions while keeping edges crisp. `radius` gates the sampled extent.
export function applyKuwaharaEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<KuwaharaEffect>,
): void {
  const radius = effect.radius ?? 3;
  const resolution = getWgpuEffectLogicalResolution(state, source);
  const pipeline = getWgpuEffectPipeline(state, 'stylization.kuwahara', KUWAHARA_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(1, radius);
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = resolution.width;
    f32[3] = resolution.height;
  });
}

export const defaultWgpuKuwaharaEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyKuwaharaEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as KuwaharaEffect);
};

export function registerWgpuKuwaharaEffect(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'KuwaharaEffect', defaultWgpuKuwaharaEffectRunner);
}

// Slot layout: [0]=radius, [1]=pad, [2..3]=resolution.
const KUWAHARA_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_radius : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const R : i32 = 4;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let r = i32(min(f32(R), uni.u_radius));
  var means : array<vec3f, 4>;
  var vars : array<f32, 4>;
  for (var q = 0; q < 4; q++) {
    let ox = select(-r, 0, (q & 1) != 0);
    let oy = select(-r, 0, (q & 2) != 0);
    var sum = vec3f(0.0);
    var sumSq = vec3f(0.0);
    var n = 0.0;
    for (var y = 0; y <= R; y++) {
      for (var x = 0; x <= R; x++) {
        if (x > r || y > r) { continue; }
        let off = vec2f(f32(ox + x), f32(oy + y)) * texel;
        let col = textureSampleLevel(tex, smp, uv + off, 0.0).rgb;
        sum += col;
        sumSq += col * col;
        n += 1.0;
      }
    }
    let mean = sum / n;
    means[q] = mean;
    let v = sumSq / n - mean * mean;
    vars[q] = v.r + v.g + v.b;
  }
  var minVar = vars[0];
  var result = means[0];
  var tiedCount = 1.0;
  for (var q = 1; q < 4; q++) {
    if (vars[q] < minVar) {
      minVar = vars[q];
      result = means[q];
      tiedCount = 1.0;
    } else if (vars[q] == minVar) {
      result += means[q];
      tiedCount += 1.0;
    }
  }
  result /= tiedCount;
  return vec4f(result, textureSampleLevel(tex, smp, uv, 0.0).a);
}`;
