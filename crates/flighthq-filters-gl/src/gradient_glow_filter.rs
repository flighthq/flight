//! Gradient-glow GL filter pass.
//!
//! Compositing order: gradient glow → source on top.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates a temporary GL texture internally on each call
//! (the gradient ramp); it is deleted before the function returns.

use flighthq_filters::GradientGlowFilter;
use glow::HasContext;

use crate::blur_filter::apply_box_blur_filter_to_gl;
use crate::filter_pass::{
    GlFullscreenProgram, clear_gl_render_target, draw_gl_fullscreen_pass, get_gl_filter_program,
};
use crate::gradient_ramp::create_gl_gradient_ramp_texture;
use crate::tint_shader::{apply_gl_blit_pass, apply_gl_tint_pass};
use crate::{GlRenderState, GlRenderTarget};

// Uses the blurred alpha (unit 0) to index a gradient ramp texture (unit 1),
// outputting the gradient-colored glow at the per-pixel intensity.
const GRADIENT_LOOKUP_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
out vec4 fragColor;
void main() {
  float alpha = texture(u_texture, v_texCoord).a;
  fragColor = texture(u_ramp, vec2(alpha, 0.5));
}";

/// Applies a gradient glow filter to `source`, writing the result to `dest`.
pub fn apply_gradient_glow_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    scratch: &[&GlRenderTarget; 3],
    filter: &GradientGlowFilter,
) {
    let quality = filter.quality.unwrap_or(1).max(1);
    let strength = filter.strength.unwrap_or(1.0);

    let s0 = scratch[0];
    let s1 = scratch[1];
    let s2 = scratch[2];

    // Extract alpha as a neutral (white) mask, then blur → s1.
    apply_gl_tint_pass(state, source, s0, 0xffffff, 1.0, strength.min(1.0));
    apply_box_blur_filter_to_gl(
        state,
        s0,
        s1,
        s2,
        filter.blur_x.unwrap_or(6.0),
        filter.blur_y.unwrap_or(6.0),
        quality,
    );

    // Build the gradient ramp texture and look up the blurred alpha → s0.
    let ratios: Vec<u8> = filter
        .ratios
        .iter()
        .map(|&r| r.round().clamp(0.0, 255.0) as u8)
        .collect();
    let ramp = create_gl_gradient_ramp_texture(state, &filter.colors, &filter.alphas, &ratios);
    apply_gradient_lookup_pass(state, s1, ramp, s0);
    unsafe {
        state.gl.delete_texture(ramp);
    }

    clear_gl_render_target(state, dest);
    apply_gl_blit_pass(state, s0, dest);
    apply_gl_blit_pass(state, source, dest);
}

/// Returns the gradient-lookup shader program for `state`, compiling on first use.
pub fn get_gradient_lookup_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, GRADIENT_LOOKUP_FRAGMENT_SRC, |p| {
        &mut p.gradient_lookup
    })
}

// Looks up the blurred alpha (unit 0) in the gradient ramp bound to unit 1.
fn apply_gradient_lookup_pass(
    state: &GlRenderState,
    blurred: &GlRenderTarget,
    ramp: glow::Texture,
    dest: &GlRenderTarget,
) {
    let program = get_gradient_lookup_shader(state);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[blurred.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.active_texture(glow::TEXTURE1);
            gl.bind_texture(glow::TEXTURE_2D, Some(ramp));
            gl.uniform_1_i32(gl.get_uniform_location(p, "u_ramp").as_ref(), 1);
            gl.active_texture(glow::TEXTURE0);
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    // GRADIENT_LOOKUP_FRAGMENT_SRC

    #[test]
    fn gradient_lookup_fragment_src_indexes_ramp_by_alpha() {
        assert!(GRADIENT_LOOKUP_FRAGMENT_SRC.contains("uniform sampler2D u_ramp"));
        assert!(GRADIENT_LOOKUP_FRAGMENT_SRC.contains("texture(u_ramp, vec2(alpha, 0.5))"));
    }
}
