//! Color-matrix wgpu filter pass.

use flighthq_filters::ColorMatrixFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, create_wgpu_filter_pipeline, draw_wgpu_filter_pass,
};

// 20-element matrix in OpenFL/Flash order: 4 rows × 5 columns.
// Offsets (column 5) are in byte scale [0,255], divided by 255 before upload.
// Input is straight RGBA (shader unmultiplies first), output is premultiplied.
//
// Uniforms layout (80 bytes): m0..m3 (vec4f rows) then offsets (vec4f).
const COLOR_MATRIX_WGSL: &str = r#"
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
}"#;

/// Applies a 4×5 color-matrix filter to `source`, writing to `dest`.
///
/// `filter.matrix` must contain 20 values in OpenFL/Flash order (4 rows × 5
/// columns). The 5th column is an additive offset in byte scale [0, 255].
/// A single GPU pass — no scratch targets needed.
///
/// # Panics
/// Panics if `filter.matrix` has fewer than 20 elements (API misuse).
pub fn apply_color_matrix_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    filter: &ColorMatrixFilter,
) {
    let m = &filter.matrix;
    assert!(m.len() >= 20, "ColorMatrixFilter requires 20 values");
    let m: [f32; 20] = std::array::from_fn(|i| m[i]);

    if filter_state.color_matrix_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(
            state,
            filter_state,
            COLOR_MATRIX_WGSL,
            WgpuBlendMode::Replace,
        );
        filter_state.color_matrix_pipeline = Some(p);
    }
    let mut pipeline = filter_state.color_matrix_pipeline.take().unwrap();
    draw_wgpu_filter_pass(
        state,
        filter_state,
        source,
        Some(dest),
        &mut pipeline,
        |u| {
            // Rows 0..3: RGBA weights (matrix columns 0..3).
            u.set_f32(0, m[0]);
            u.set_f32(1, m[1]);
            u.set_f32(2, m[2]);
            u.set_f32(3, m[3]);
            u.set_f32(4, m[5]);
            u.set_f32(5, m[6]);
            u.set_f32(6, m[7]);
            u.set_f32(7, m[8]);
            u.set_f32(8, m[10]);
            u.set_f32(9, m[11]);
            u.set_f32(10, m[12]);
            u.set_f32(11, m[13]);
            u.set_f32(12, m[15]);
            u.set_f32(13, m[16]);
            u.set_f32(14, m[17]);
            u.set_f32(15, m[18]);
            // Offsets (matrix column 5), byte scale -> [0, 1].
            u.set_f32(16, m[4] / 255.0);
            u.set_f32(17, m[9] / 255.0);
            u.set_f32(18, m[14] / 255.0);
            u.set_f32(19, m[19] / 255.0);
        },
    );
    filter_state.color_matrix_pipeline = Some(pipeline);
}

#[cfg(test)]
mod tests {
    use super::*;

    // COLOR_MATRIX_WGSL

    #[test]
    fn color_matrix_wgsl_unpremultiplies_then_repremultiplies() {
        assert!(COLOR_MATRIX_WGSL.contains("if (c.a > 0.0) { c = vec4f(c.rgb / c.a, c.a); }"));
        assert!(COLOR_MATRIX_WGSL.contains("out_c = vec4f(out_c.rgb * out_c.a, out_c.a)"));
    }

    #[test]
    fn color_matrix_wgsl_declares_five_vec4_uniform_rows() {
        for field in ["m0", "m1", "m2", "m3", "offsets"] {
            assert!(COLOR_MATRIX_WGSL.contains(&format!("{field} : vec4f")));
        }
    }
}
