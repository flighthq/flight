import type { ColorMatrixFilter } from '@flighthq/types';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

import type { WebGPUFilterPipeline } from './filterPass';
import { createWebGPUFilterPipeline, drawWebGPUFilterPass } from './filterPass';

// 20-element matrix in OpenFL/Flash order: 4 rows × 5 columns.
// Offsets (column 5) are in byte scale [0,255], divided by 255 before upload.
// Input is straight RGBA (shader unmultiplies first), output is premultiplied.
//
// Uniforms layout (80 bytes):
//   offset  0: m0 (vec4f) — row 0 RGBA weights
//   offset 16: m1 (vec4f)
//   offset 32: m2 (vec4f)
//   offset 48: m3 (vec4f)
//   offset 64: offsets (vec4f)
const COLOR_MATRIX_WGSL = /* wgsl */ `
struct Uniforms {
  m0 : vec4f,
  m1 : vec4f,
  m2 : vec4f,
  m3 : vec4f,
  offsets : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  var c = textureSampleLevel(tex, smp, uv, 0.0);
  if (c.a > 0.0) { c = vec4f(c.rgb / c.a, c.a); }
  var out_c : vec4f;
  out_c.r = clamp(dot(c, uni.m0) + uni.offsets.r, 0.0, 1.0);
  out_c.g = clamp(dot(c, uni.m1) + uni.offsets.g, 0.0, 1.0);
  out_c.b = clamp(dot(c, uni.m2) + uni.offsets.b, 0.0, 1.0);
  out_c.a = clamp(dot(c, uni.m3) + uni.offsets.a, 0.0, 1.0);
  out_c = vec4f(out_c.rgb * out_c.a, out_c.a);
  return out_c;
}`;

const shaders = new WeakMap<WebGPURenderState, WebGPUFilterPipeline>();

function getPipeline(state: WebGPURenderState): WebGPUFilterPipeline {
  let p = shaders.get(state);
  if (p === undefined) {
    p = createWebGPUFilterPipeline(state, COLOR_MATRIX_WGSL, 'replace');
    shaders.set(state, p);
  }
  return p;
}

/**
 * Applies a 4×5 color matrix filter to `source`, writing to `dest`.
 * The matrix is 20 values in OpenFL/Flash order; the 5th column is an additive
 * offset in byte scale [0,255].
 */
export function applyColorMatrixFilterToWebGPU(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget,
  filter: Readonly<Omit<ColorMatrixFilter, 'type'>>,
): void {
  const { matrix } = filter;
  if (matrix.length < 20) throw new Error('ColorMatrixFilter requires 20 values');

  const pipeline = getPipeline(state);
  drawWebGPUFilterPass(state, source, dest, pipeline, (f32) => {
    f32[0] = matrix[0];
    f32[1] = matrix[1];
    f32[2] = matrix[2];
    f32[3] = matrix[3];
    f32[4] = matrix[5];
    f32[5] = matrix[6];
    f32[6] = matrix[7];
    f32[7] = matrix[8];
    f32[8] = matrix[10];
    f32[9] = matrix[11];
    f32[10] = matrix[12];
    f32[11] = matrix[13];
    f32[12] = matrix[15];
    f32[13] = matrix[16];
    f32[14] = matrix[17];
    f32[15] = matrix[18];
    f32[16] = matrix[4] / 255;
    f32[17] = matrix[9] / 255;
    f32[18] = matrix[14] / 255;
    f32[19] = matrix[19] / 255;
  });
}
