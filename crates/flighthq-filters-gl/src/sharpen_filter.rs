//! Sharpen GL filter pass.
//!
//! Uses an unsharp mask: `sharpened = source + (source − blurred) × amount`.
//!
//! `scratch` must contain two render targets: one for the blurred image and one
//! for the blur ping-pong temp. This function allocates nothing itself.

use flighthq_filters::SharpenFilter;
use glow::HasContext;

use crate::blur_filter::apply_box_blur_filter_to_gl;
use crate::filter_pass::{GlFullscreenProgram, draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::{GlRenderState, GlRenderTarget};

// Unsharp mask: source0 = original (unit 0), source1 = blurred (unit 1).
const SHARPEN_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_amount;
out vec4 fragColor;
void main() {
  vec4 src = texture(u_texture0, v_texCoord);
  vec4 blurred = texture(u_texture1, v_texCoord);
  fragColor = clamp(src + (src - blurred) * u_amount, 0.0, 1.0);
}";

/// Sharpens `source` using an unsharp mask, writing to `dest`.
pub fn apply_sharpen_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    scratch: &[&GlRenderTarget; 2],
    filter: &SharpenFilter,
) {
    let quality = filter.quality.unwrap_or(1).max(1);
    let amount = filter.amount.unwrap_or(1.0);
    let blur_x = filter.blur_x.unwrap_or(2.0);
    let blur_y = filter.blur_y.unwrap_or(2.0);

    let blurred = scratch[0];
    let blur_temp = scratch[1];

    apply_box_blur_filter_to_gl(state, source, blurred, blur_temp, blur_x, blur_y, quality);

    let program = get_sharpen_shader(state);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[source.texture, blurred.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_amount").as_ref(), amount);
        },
    );
}

/// Returns the sharpen shader program for `state`, compiling on first use.
pub fn get_sharpen_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, SHARPEN_FRAGMENT_SRC, |p| &mut p.sharpen)
}

#[cfg(test)]
mod tests {
    use super::*;

    // SHARPEN_FRAGMENT_SRC

    #[test]
    fn sharpen_fragment_src_applies_unsharp_mask() {
        assert!(SHARPEN_FRAGMENT_SRC.contains("(src - blurred) * u_amount"));
        assert!(SHARPEN_FRAGMENT_SRC.contains("uniform sampler2D u_texture1"));
    }
}
