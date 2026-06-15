import type { MedianFilter } from '@flighthq/types';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import type { WebGPUFilterPipeline } from './filterPass';
import { createWebGPUFilterPipeline, drawWebGPUFilterPass } from './filterPass';

// Supports radius up to 2 (5×5 = 25 samples). For larger radii use the surface path.
// Sorts per-channel independently using insertion sort.
const MAX_RADIUS = 2;
const MAX_SAMPLES = (MAX_RADIUS * 2 + 1) * (MAX_RADIUS * 2 + 1); // 25

// Uniforms layout (16 bytes):
//   offset 0: texelSize (vec2f)
//   offset 8: radius (i32)
//   offset 12: _pad (i32)
const MEDIAN_WGSL = /* wgsl */ `
struct Uniforms {
  texelSize : vec2f,
  radius : i32,
  _pad : i32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const MAX_S = ${MAX_SAMPLES};

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
  let r = clamp(uni.radius, 0, ${MAX_RADIUS});
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  let n = (2 * r + 1) * (2 * r + 1);
  var rv : array<f32, ${MAX_SAMPLES}>;
  var gv : array<f32, ${MAX_SAMPLES}>;
  var bv : array<f32, ${MAX_SAMPLES}>;
  var av : array<f32, ${MAX_SAMPLES}>;
  var count = 0;
  for (var dy = -${MAX_RADIUS}; dy <= ${MAX_RADIUS}; dy++) {
    for (var dx = -${MAX_RADIUS}; dx <= ${MAX_RADIUS}; dx++) {
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

const shaders = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();

function getPipeline(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = shaders.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, MEDIAN_WGSL, 'replace');
    shaders.set(state, p);
  }
  return p;
}

/**
 * Applies a per-channel median filter to `source`, writing to `dest`.
 * Preserves edges while removing noise. Supports radius 0–2 (up to 5×5);
 * use `applyMedianFilterToSurface` for larger radii.
 * A single GPU pass — no scratch targets needed.
 */
export function applyMedianFilterToWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  filter: Readonly<Omit<MedianFilter, 'type'>>,
): void {
  const radius = Math.min(MAX_RADIUS, Math.max(0, Math.round(filter.radius ?? 1)));
  const pipeline = getPipeline(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, (f32, i32) => {
    f32[0] = 1 / source.width;
    f32[1] = 1 / source.height;
    i32[2] = radius;
  });
}
