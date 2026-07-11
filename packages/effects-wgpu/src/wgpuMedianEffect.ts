import type { MedianEffect, WgpuRenderEffectRunner, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Largest median-filter radius the WebGPU path supports (radius 2 → a 5×5, 25-sample window). The cap
// is the fixed sort-array size in the shader; sorts each channel independently with insertion sort.
export const MAX_MEDIAN_EFFECT_WGPU_RADIUS = 2;

const MAX_SAMPLES = (MAX_MEDIAN_EFFECT_WGPU_RADIUS * 2 + 1) * (MAX_MEDIAN_EFFECT_WGPU_RADIUS * 2 + 1); // 25

// Per-channel median denoise: each output pixel is the median of its (2·radius+1)² neighborhood.
// Preserves edges while removing salt-and-pepper noise. A single GPU pass — no scratch targets.
export function applyMedianEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  effect: Readonly<MedianEffect>,
): void {
  const radius = Math.min(MAX_MEDIAN_EFFECT_WGPU_RADIUS, Math.max(0, Math.round(effect.radius ?? 1)));
  const pipeline = getWgpuEffectPipeline(state, 'stylization.median', MEDIAN_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32, i32) => {
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    i32[2] = radius;
  });
}

export const defaultWgpuMedianEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyMedianEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as MedianEffect);
};

// Uniforms layout (16 bytes): offset 0 texelSize (vec2f), offset 8 radius (i32), offset 12 _pad (i32).
const MEDIAN_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize : vec2f,
  radius : i32,
  _pad : i32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sortArr(arr : ptr<function, array<f32, ${MAX_SAMPLES}>>, n : i32) {
  for (var i = 1; i < n; i++) {
    let key = (*arr)[i];
    var j = i - 1;
    loop {
      if (j < 0 || (*arr)[j] <= key) { break; }
      (*arr)[j + 1] = (*arr)[j];
      j -= 1;
    }
    (*arr)[j + 1] = key;
  }
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = clamp(uni.radius, 0, ${MAX_MEDIAN_EFFECT_WGPU_RADIUS});
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  let n = (2 * r + 1) * (2 * r + 1);
  var rv : array<f32, ${MAX_SAMPLES}>;
  var gv : array<f32, ${MAX_SAMPLES}>;
  var bv : array<f32, ${MAX_SAMPLES}>;
  var av : array<f32, ${MAX_SAMPLES}>;
  var count = 0;
  for (var dy = -${MAX_MEDIAN_EFFECT_WGPU_RADIUS}; dy <= ${MAX_MEDIAN_EFFECT_WGPU_RADIUS}; dy++) {
    for (var dx = -${MAX_MEDIAN_EFFECT_WGPU_RADIUS}; dx <= ${MAX_MEDIAN_EFFECT_WGPU_RADIUS}; dx++) {
      if (abs(dy) <= r && abs(dx) <= r) {
        let s = textureSampleLevel(tex, smp, uv + vec2f(f32(dx), f32(dy)) * uni.texelSize, 0.0);
        rv[count] = s.r;
        gv[count] = s.g;
        bv[count] = s.b;
        av[count] = s.a;
        count += 1;
      }
    }
  }
  sortArr(&rv, n);
  sortArr(&gv, n);
  sortArr(&bv, n);
  sortArr(&av, n);
  let mid = n / 2;
  return vec4f(rv[mid], gv[mid], bv[mid], av[mid]);
}`;
