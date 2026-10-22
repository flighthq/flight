// flight-lint: allow-file(contract-vocabulary) D17 color passes accept native glow targets and Result diagnostics
//! Generic pointwise color-matrix pass — the single fold-in realization for the whole matrix-tier
//! Adjustment family. A run of consecutive matrix-tier adjustments fuses to ONE 4×5 matrix (linear
//! RGBA coefficients + normalized-linear bias column) and runs through this one pass instead of one
//! pass per op. Sampled color is treated as premultiplied and the RGB result is clamped.

use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::gl_effect_program_cache::get_gl_effect_program;
use crate::gl_effect_support::uniform_1fv;

// The bias column (indices 4, 9, 14, 19) is already normalized-linear.
const COLOR_MATRIX_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_colorMatrix[20];
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float r = c.r, g = c.g, b = c.b, a = c.a;
  float nr = u_colorMatrix[0] * r + u_colorMatrix[1] * g + u_colorMatrix[2] * b + u_colorMatrix[3] * a + u_colorMatrix[4];
  float ng = u_colorMatrix[5] * r + u_colorMatrix[6] * g + u_colorMatrix[7] * b + u_colorMatrix[8] * a + u_colorMatrix[9];
  float nb = u_colorMatrix[10] * r + u_colorMatrix[11] * g + u_colorMatrix[12] * b + u_colorMatrix[13] * a + u_colorMatrix[14];
  float na = u_colorMatrix[15] * r + u_colorMatrix[16] * g + u_colorMatrix[17] * b + u_colorMatrix[18] * a + u_colorMatrix[19];
  o_color = vec4(clamp(vec3(nr, ng, nb), 0.0, 1.0), na);
}"#;

/// Draws `source` into `dest` through one fused 4×5 color matrix. A matrix shorter than twenty
/// coefficients zero-fills; coefficients past the twentieth are ignored.
#[allow(clippy::ptr_arg)]
pub fn apply_color_matrix_pass_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    matrix: &Vec<f32>,
) -> Result<(), String> {
    let mut m = [0.0_f32; 20];
    for (index, value) in m.iter_mut().enumerate() {
        *value = matrix.get(index).copied().unwrap_or(0.0);
    }
    let program =
        get_gl_effect_program(state, "adjustment.colorMatrix", COLOR_MATRIX_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1fv(gl, p, "u_colorMatrix", &m);
    });
}
