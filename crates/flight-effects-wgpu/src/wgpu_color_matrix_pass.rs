// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the pass takes host-supplied wgpu targets
//! The generic pointwise color-matrix pass (TS `wgpuColorMatrixPass.ts`): the single fold-in
//! realization for the whole matrix-tier adjustment family on WebGPU. A run of consecutive
//! matrix-tier adjustments fuses to ONE 4x5 matrix (linear RGBA coefficients plus a
//! normalized-linear bias column) and runs through this one pass. Sampled color is treated as
//! premultiplied and the RGB result is clamped.

use flight_render_wgpu::{WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;

// Slot layout: [0..3]=row R, [4..7]=row G, [8..11]=row B, [12..15]=row A, [16..19]=bias column.
const COLOR_MATRIX_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_row_r : vec4f, u_row_g : vec4f, u_row_b : vec4f, u_row_a : vec4f, u_offset : vec4f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let nr = uni.u_row_r.x * c.r + uni.u_row_r.y * c.g + uni.u_row_r.z * c.b + uni.u_row_r.w * c.a + uni.u_offset.x;
  let ng = uni.u_row_g.x * c.r + uni.u_row_g.y * c.g + uni.u_row_g.z * c.b + uni.u_row_g.w * c.a + uni.u_offset.y;
  let nb = uni.u_row_b.x * c.r + uni.u_row_b.y * c.g + uni.u_row_b.z * c.b + uni.u_row_b.w * c.a + uni.u_offset.z;
  let na = uni.u_row_a.x * c.r + uni.u_row_a.y * c.g + uni.u_row_a.z * c.b + uni.u_row_a.w * c.a + uni.u_offset.w;
  return vec4f(clamp(vec3f(nr, ng, nb), vec3f(0.0), vec3f(1.0)), na);
}"#;

/// Runs one fused 4x5 color matrix from `source` into `dest` (TS `applyColorMatrixPassToWgpu`).
/// Missing coefficients read as zero and coefficients past the twentieth are ignored.
#[allow(clippy::ptr_arg)] // the read-only `&Vec<N>` vocabulary row: TS `readonly number[]`
pub fn apply_color_matrix_pass_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    matrix: &Vec<f32>,
) {
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "adjustment.colorMatrix",
        COLOR_MATRIX_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    let at = |index: usize| -> f32 { matrix.get(index).copied().unwrap_or(0.0) };
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            // Four coefficient rows (R/G/B/A) as vec4f, then the normalized bias column as a fifth.
            f32[0] = at(0);
            f32[1] = at(1);
            f32[2] = at(2);
            f32[3] = at(3);
            f32[4] = at(5);
            f32[5] = at(6);
            f32[6] = at(7);
            f32[7] = at(8);
            f32[8] = at(10);
            f32[9] = at(11);
            f32[10] = at(12);
            f32[11] = at(13);
            f32[12] = at(15);
            f32[13] = at(16);
            f32[14] = at(17);
            f32[15] = at(18);
            f32[16] = at(4);
            f32[17] = at(9);
            f32[18] = at(14);
            f32[19] = at(19);
        },
    );
}
