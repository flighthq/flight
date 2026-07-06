//! Convolution (kernel) GL filter pass.
//!
//! Supports kernels up to 7×7 (49 entries). Larger kernels should use the
//! CPU surface path in `flighthq-filters`.

use flighthq_filters::ConvolutionFilter;
use flighthq_render_gl::GlFullscreenProgram;
use glow::HasContext;

use crate::filter_pass::{draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::{GlRenderState, GlRenderTarget};

// Max supported kernel: 7×7. Use the surface path for larger kernels.
const MAX_KERNEL: usize = 49;

const CONVOLUTION_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_matrix[49];
uniform int u_matrixX;
uniform int u_matrixY;
uniform float u_divisor;
uniform float u_bias;
uniform bool u_clamp;
uniform bool u_preserveAlpha;
uniform vec4 u_edgeColor;
out vec4 fragColor;

vec4 sampleAt(vec2 uv) {
  if (u_clamp) {
    return texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return u_edgeColor;
  }
  return texture(u_texture, uv);
}

void main() {
  int offsetX = u_matrixX / 2;
  int offsetY = u_matrixY / 2;
  vec4 sum = vec4(0.0);
  for (int ky = 0; ky < u_matrixY; ky++) {
    for (int kx = 0; kx < u_matrixX; kx++) {
      float weight = u_matrix[ky * u_matrixX + kx];
      vec2 off = vec2(float(kx - offsetX), float(ky - offsetY)) * u_texelSize;
      sum += sampleAt(v_texCoord + off) * weight;
    }
  }
  sum /= u_divisor;
  sum += u_bias / 255.0;
  sum = clamp(sum, 0.0, 1.0);
  if (u_preserveAlpha) {
    float origAlpha = texture(u_texture, v_texCoord).a;
    vec3 straightRGB = (sum.a > 0.0) ? clamp(sum.rgb / sum.a, 0.0, 1.0) : vec3(0.0);
    sum = vec4(straightRGB * origAlpha, origAlpha);
  }
  fragColor = sum;
}";

/// Applies a convolution filter to `source`, writing to `dest`.
///
/// Kernels larger than 7×7 are not supported; use `apply_convolution_filter_to_surface`
/// from `flighthq-filters` for those. A single GPU pass — no scratch targets needed.
///
/// # Panics
/// Panics if the matrix dimensions are zero, exceed 7×7, or the matrix length is
/// smaller than `matrix_x * matrix_y` — all programmer errors in the descriptor.
pub fn apply_convolution_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    filter: &ConvolutionFilter,
) {
    let matrix_x = filter.matrix_x as usize;
    let matrix_y = filter.matrix_y as usize;
    assert!(
        matrix_x > 0 && matrix_y > 0,
        "Convolution matrix dimensions must be positive"
    );
    assert!(
        matrix_x * matrix_y <= MAX_KERNEL,
        "Convolution kernel exceeds the GL maximum of 7×7"
    );
    assert!(
        filter.matrix.len() >= matrix_x * matrix_y,
        "Convolution matrix does not match its declared dimensions"
    );

    let bias = filter.bias.unwrap_or(0.0);
    let clamp_edge = filter.clamp.unwrap_or(true);
    let preserve_alpha = filter.preserve_alpha.unwrap_or(true);
    let edge_color = filter.color.unwrap_or(0);
    let divisor = filter
        .divisor
        .unwrap_or_else(|| auto_divisor(&filter.matrix, matrix_x * matrix_y));

    let mut matrix_data = [0.0_f32; MAX_KERNEL];
    matrix_data[..matrix_x * matrix_y].copy_from_slice(&filter.matrix[..matrix_x * matrix_y]);

    let (tx, ty) = (1.0 / source.width as f32, 1.0 / source.height as f32);
    let program = get_convolution_shader(state);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(gl.get_uniform_location(p, "u_texelSize").as_ref(), tx, ty);
            gl.uniform_1_f32_slice(
                gl.get_uniform_location(p, "u_matrix[0]").as_ref(),
                &matrix_data,
            );
            gl.uniform_1_i32(
                gl.get_uniform_location(p, "u_matrixX").as_ref(),
                matrix_x as i32,
            );
            gl.uniform_1_i32(
                gl.get_uniform_location(p, "u_matrixY").as_ref(),
                matrix_y as i32,
            );
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_divisor").as_ref(), divisor);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_bias").as_ref(), bias);
            gl.uniform_1_i32(
                gl.get_uniform_location(p, "u_clamp").as_ref(),
                clamp_edge as i32,
            );
            gl.uniform_1_i32(
                gl.get_uniform_location(p, "u_preserveAlpha").as_ref(),
                preserve_alpha as i32,
            );
            gl.uniform_4_f32(
                gl.get_uniform_location(p, "u_edgeColor").as_ref(),
                ((edge_color >> 16) & 0xff) as f32 / 255.0,
                ((edge_color >> 8) & 0xff) as f32 / 255.0,
                (edge_color & 0xff) as f32 / 255.0,
                ((edge_color >> 24) & 0xff) as f32 / 255.0,
            );
        },
    );
}

/// Returns the convolution shader program for `state`, compiling on first use.
pub fn get_convolution_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, CONVOLUTION_FRAGMENT_SRC, |p| &mut p.convolution)
}

// Sums the first `length` matrix entries; a zero sum falls back to 1 to avoid
// dividing the convolution result by zero.
fn auto_divisor(matrix: &[f32], length: usize) -> f32 {
    let sum: f32 = matrix[..length.min(matrix.len())].iter().sum();
    if sum == 0.0 { 1.0 } else { sum }
}

#[cfg(test)]
mod tests {
    use super::*;

    // CONVOLUTION_FRAGMENT_SRC

    #[test]
    fn convolution_fragment_src_declares_kernel_array() {
        assert!(CONVOLUTION_FRAGMENT_SRC.contains("uniform float u_matrix[49]"));
        assert!(CONVOLUTION_FRAGMENT_SRC.contains("sum /= u_divisor"));
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
}
