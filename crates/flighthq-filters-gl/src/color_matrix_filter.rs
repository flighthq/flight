//! Color-matrix GL filter pass.

use flighthq_filters::ColorMatrixFilter;
use glow::HasContext;

use crate::filter_pass::{GlFullscreenProgram, draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::{GlRenderState, GlRenderTarget};

// 20-element matrix in OpenFL/Flash order: 4 rows × 5 columns. Offsets (column 5)
// are in byte scale [0, 255], divided by 255 before upload. Input is straight
// RGBA (shader unmultiplies first), output is premultiplied.
const COLOR_MATRIX_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec4 u_m0;
uniform vec4 u_m1;
uniform vec4 u_m2;
uniform vec4 u_m3;
uniform vec4 u_offsets;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_texture, v_texCoord);
  if (c.a > 0.0) { c.rgb /= c.a; }
  vec4 out_c;
  out_c.r = clamp(dot(c, u_m0) + u_offsets.r, 0.0, 1.0);
  out_c.g = clamp(dot(c, u_m1) + u_offsets.g, 0.0, 1.0);
  out_c.b = clamp(dot(c, u_m2) + u_offsets.b, 0.0, 1.0);
  out_c.a = clamp(dot(c, u_m3) + u_offsets.a, 0.0, 1.0);
  out_c.rgb *= out_c.a;
  fragColor = out_c;
}";

/// Applies a 4×5 color-matrix filter to `source`, writing to `dest`.
///
/// `filter.matrix` must contain 20 values in OpenFL/Flash order (4 rows × 5
/// columns). The 5th column is an additive offset in byte scale [0, 255].
///
/// # Panics
/// Panics if `filter.matrix` has fewer than 20 values — a programmer error in
/// the filter descriptor.
pub fn apply_color_matrix_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    filter: &ColorMatrixFilter,
) {
    let m = &filter.matrix;
    assert!(m.len() >= 20, "ColorMatrixFilter requires 20 values");
    let m: [f32; 20] = std::array::from_fn(|i| m[i]);

    let program = get_color_matrix_shader(state);
    draw_gl_fullscreen_pass(state, program, &[source.texture], Some(dest), move |gl, p| unsafe {
        gl.uniform_4_f32(gl.get_uniform_location(p, "u_m0").as_ref(), m[0], m[1], m[2], m[3]);
        gl.uniform_4_f32(gl.get_uniform_location(p, "u_m1").as_ref(), m[5], m[6], m[7], m[8]);
        gl.uniform_4_f32(gl.get_uniform_location(p, "u_m2").as_ref(), m[10], m[11], m[12], m[13]);
        gl.uniform_4_f32(gl.get_uniform_location(p, "u_m3").as_ref(), m[15], m[16], m[17], m[18]);
        gl.uniform_4_f32(
            gl.get_uniform_location(p, "u_offsets").as_ref(),
            m[4] / 255.0,
            m[9] / 255.0,
            m[14] / 255.0,
            m[19] / 255.0,
        );
    });
}

/// Returns the color-matrix shader program for `state`, compiling on first use.
pub fn get_color_matrix_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, COLOR_MATRIX_FRAGMENT_SRC, |p| &mut p.color_matrix)
}

#[cfg(test)]
mod tests {
    use super::*;

    // COLOR_MATRIX_FRAGMENT_SRC

    #[test]
    fn color_matrix_fragment_src_unmultiplies_then_remultiplies_alpha() {
        assert!(COLOR_MATRIX_FRAGMENT_SRC.contains("c.rgb /= c.a"));
        assert!(COLOR_MATRIX_FRAGMENT_SRC.contains("out_c.rgb *= out_c.a"));
        assert!(COLOR_MATRIX_FRAGMENT_SRC.contains("dot(c, u_m0)"));
    }
}
