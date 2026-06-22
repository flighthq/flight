//! Convolution (kernel) wgpu filter pass.
//!
//! Supports kernels up to 7×7 (49 entries). Use the CPU surface path for larger.

use flighthq_filters::ConvolutionFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, create_wgpu_filter_pipeline, draw_wgpu_filter_pass,
};

// Max supported kernel: 7×7 = 49 elements. Use the surface path for larger kernels.
const MAX_KERNEL: u32 = 49;

// Uniforms layout:
//   offset  0: texelSize (vec2f, 8 bytes)
//   offset  8: matrixX (i32) / offset 12: matrixY (i32)
//   offset 16: divisor (f32) / offset 20: bias (f32)
//   offset 24: clampEdge (i32) / offset 28: preserveAlpha (i32)
//   offset 32: edgeColor (vec4f) / offset 48: matrix (array<f32, 49>)
// Total 244 bytes -> struct padded to 256.
const CONVOLUTION_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  matrixX : i32,
  matrixY : i32,
  divisor : f32,
  bias : f32,
  clampEdge : i32,
  preserveAlpha : i32,
  edgeColor : vec4f,
  matrix : array<f32, 49>,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sampleAt(uv : vec2f) -> vec4f {
  if (uni.clampEdge != 0) {
    return textureSampleLevel(tex, smp, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0);
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return uni.edgeColor;
  }
  return textureSampleLevel(tex, smp, uv, 0.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let offsetX = uni.matrixX / 2;
  let offsetY = uni.matrixY / 2;
  var sum = vec4f(0.0);
  for (var ky : i32 = 0; ky < uni.matrixY; ky++) {
    for (var kx : i32 = 0; kx < uni.matrixX; kx++) {
      let weight = uni.matrix[ky * uni.matrixX + kx];
      let off = vec2f(f32(kx - offsetX), f32(ky - offsetY)) * uni.texelSize;
      sum += sampleAt(uv + off) * weight;
    }
  }
  sum = sum / uni.divisor;
  sum += uni.bias / 255.0;
  sum = clamp(sum, vec4f(0.0), vec4f(1.0));
  if (uni.preserveAlpha != 0) {
    let origAlpha = textureSampleLevel(tex, smp, uv, 0.0).a;
    let straightRGB = select(vec3f(0.0), clamp(sum.rgb / sum.a, vec3f(0.0), vec3f(1.0)), sum.a > 0.0);
    sum = vec4f(straightRGB * origAlpha, origAlpha);
  }
  return sum;
}"#;

/// Applies a convolution filter to `source`, writing to `dest`.
/// A single GPU pass — no scratch targets needed.
///
/// # Panics
/// Panics on API misuse: non-positive dimensions, a kernel larger than 7×7, or a
/// matrix shorter than its declared dimensions.
pub fn apply_convolution_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    filter: &ConvolutionFilter,
) {
    let matrix_x = filter.matrix_x;
    let matrix_y = filter.matrix_y;
    assert!(matrix_x > 0 && matrix_y > 0, "Convolution matrix dimensions must be positive");
    let count = matrix_x * matrix_y;
    assert!(
        count <= MAX_KERNEL,
        "Convolution kernel exceeds the wgpu maximum of 7×7 ({matrix_x}×{matrix_y} given)"
    );
    assert!(
        filter.matrix.len() as u32 >= count,
        "Convolution matrix does not match its declared dimensions"
    );

    let bias = filter.bias.unwrap_or(0.0);
    let clamp_edge = filter.clamp.unwrap_or(true);
    let preserve_alpha = filter.preserve_alpha.unwrap_or(true);
    let edge_color = filter.color.unwrap_or(0);
    let divisor = filter.divisor.unwrap_or_else(|| auto_divisor(&filter.matrix, count as usize));

    let (sw, sh) = (source.width as f32, source.height as f32);
    let matrix = filter.matrix.clone();

    if filter_state.convolution_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(state, filter_state, CONVOLUTION_WGSL, WgpuBlendMode::Replace);
        filter_state.convolution_pipeline = Some(p);
    }
    let mut pipeline = filter_state.convolution_pipeline.take().unwrap();
    draw_wgpu_filter_pass(state, filter_state, source, Some(dest), &mut pipeline, |u| {
        u.set_f32(0, 1.0 / sw);
        u.set_f32(1, 1.0 / sh);
        u.set_i32(2, matrix_x as i32);
        u.set_i32(3, matrix_y as i32);
        u.set_f32(4, divisor);
        u.set_f32(5, bias);
        u.set_i32(6, if clamp_edge { 1 } else { 0 });
        u.set_i32(7, if preserve_alpha { 1 } else { 0 });
        // edgeColor at element 8..11 (offset 32). Alpha is the high byte (0xAARRGGBB).
        u.set_f32(8, ((edge_color >> 16) & 0xff) as f32 / 255.0);
        u.set_f32(9, ((edge_color >> 8) & 0xff) as f32 / 255.0);
        u.set_f32(10, (edge_color & 0xff) as f32 / 255.0);
        u.set_f32(11, ((edge_color >> 24) & 0xff) as f32 / 255.0);
        // matrix at element 12.. (offset 48).
        for (i, &w) in matrix.iter().take(count as usize).enumerate() {
            u.set_f32(12 + i, w);
        }
    });
    filter_state.convolution_pipeline = Some(pipeline);
}

// Sums the kernel; a zero sum falls back to 1 so the divide is a no-op.
fn auto_divisor(matrix: &[f32], count: usize) -> f32 {
    let sum: f32 = matrix.iter().take(count).sum();
    if sum == 0.0 { 1.0 } else { sum }
}

#[cfg(test)]
mod tests {
    use super::*;

    // CONVOLUTION_WGSL

    #[test]
    fn convolution_wgsl_declares_49_element_kernel() {
        assert!(CONVOLUTION_WGSL.contains("matrix : array<f32, 49>"));
    }

    #[test]
    fn convolution_wgsl_applies_divisor_and_bias() {
        assert!(CONVOLUTION_WGSL.contains("sum = sum / uni.divisor"));
        assert!(CONVOLUTION_WGSL.contains("sum += uni.bias / 255.0"));
    }

    // auto_divisor

    #[test]
    fn auto_divisor_sums_kernel() {
        assert_eq!(auto_divisor(&[1.0, 2.0, 3.0], 3), 6.0);
    }

    #[test]
    fn auto_divisor_zero_sum_falls_back_to_one() {
        assert_eq!(auto_divisor(&[1.0, -1.0], 2), 1.0);
    }

    #[test]
    fn auto_divisor_respects_count_limit() {
        // Only the first two elements are summed.
        assert_eq!(auto_divisor(&[2.0, 3.0, 100.0], 2), 5.0);
    }
}
