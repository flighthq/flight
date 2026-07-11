import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// Generic pointwise color-matrix pass — the single fold-in realization for the whole matrix-tier
// Adjustment family on WebGPU. A run of consecutive matrix-tier adjustments fuses to ONE 4×5 matrix (in
// the adjustments colorMatrixMath convention: linear RGBA coefficients + a 0–255 offset column) and
// runs through this one pass instead of one pass per op. Sampled color is treated as premultiplied and
// the RGB result is clamped, matching the per-op color passes this replaces.
export function applyColorMatrixPassToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
  matrix: ReadonlyArray<number>,
): void {
  const pipeline = getWgpuEffectPipeline(state, 'adjustment.colorMatrix', COLOR_MATRIX_FRAGMENT_WGSL, 'replace');
  drawWgpuEffectPass(state, source as WgpuRenderTarget, dest as WgpuRenderTarget, pipeline, (f32) => {
    // Four coefficient rows (R/G/B/A) as vec4f, then the offset column as a fifth vec4f.
    f32[0] = matrix[0] ?? 0;
    f32[1] = matrix[1] ?? 0;
    f32[2] = matrix[2] ?? 0;
    f32[3] = matrix[3] ?? 0;
    f32[4] = matrix[5] ?? 0;
    f32[5] = matrix[6] ?? 0;
    f32[6] = matrix[7] ?? 0;
    f32[7] = matrix[8] ?? 0;
    f32[8] = matrix[10] ?? 0;
    f32[9] = matrix[11] ?? 0;
    f32[10] = matrix[12] ?? 0;
    f32[11] = matrix[13] ?? 0;
    f32[12] = matrix[15] ?? 0;
    f32[13] = matrix[16] ?? 0;
    f32[14] = matrix[17] ?? 0;
    f32[15] = matrix[18] ?? 0;
    f32[16] = matrix[4] ?? 0;
    f32[17] = matrix[9] ?? 0;
    f32[18] = matrix[14] ?? 0;
    f32[19] = matrix[19] ?? 0;
  });
}

// Slot layout: [0..3]=row R, [4..7]=row G, [8..11]=row B, [12..15]=row A, [16..19]=offset column.
// The offset column is 0–255; normalized color needs it divided by 255.
const COLOR_MATRIX_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_row_r : vec4f, u_row_g : vec4f, u_row_b : vec4f, u_row_a : vec4f, u_offset : vec4f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let nr = uni.u_row_r.x * c.r + uni.u_row_r.y * c.g + uni.u_row_r.z * c.b + uni.u_row_r.w * c.a + uni.u_offset.x / 255.0;
  let ng = uni.u_row_g.x * c.r + uni.u_row_g.y * c.g + uni.u_row_g.z * c.b + uni.u_row_g.w * c.a + uni.u_offset.y / 255.0;
  let nb = uni.u_row_b.x * c.r + uni.u_row_b.y * c.g + uni.u_row_b.z * c.b + uni.u_row_b.w * c.a + uni.u_offset.z / 255.0;
  let na = uni.u_row_a.x * c.r + uni.u_row_a.y * c.g + uni.u_row_a.z * c.b + uni.u_row_a.w * c.a + uni.u_offset.w / 255.0;
  return vec4f(clamp(vec3f(nr, ng, nb), vec3f(0.0), vec3f(1.0)), na);
}`;
