//! Inner-glow GL filter pass.
//!
//! The glow appears at the interior edges of the source shape.
//!
//! Algorithm:
//!   1. Invert-tint pass: extracts inverted alpha, tinted with glow color.
//!   2. Blur pass: spreads the inverted tint toward the interior.
//!   3. Clip pass: multiplies the blurred glow by source alpha to confine it.
//!   4. Composite: source + clipped glow.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates nothing itself.
//!
//! All filter passes use ONE / ONE_MINUS_SRC_ALPHA premultiplied blending and
//! never implicitly clear their destination, so scratch targets are cleared
//! before reuse to give clean replacement semantics.

use flighthq_filters::InnerGlowFilter;

use crate::blur_filter::apply_box_blur_filter_to_gl;
use crate::filter_pass::{
    GlFullscreenProgram, clear_gl_render_target, draw_gl_fullscreen_pass, get_gl_filter_program,
};
use crate::tint_shader::{apply_gl_blit_pass, apply_gl_invert_tint_pass};
use crate::{GlRenderState, GlRenderTarget};

// Clips unit-0 (blurred inverted-alpha mask) to the source alpha from unit-1.
// The blurred inverted alpha is highest near interior edges; clipping to source
// alpha removes any glow that spilled outside the shape boundary.
const INNER_CLIP_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
out vec4 fragColor;
void main() {
  vec4 glow = texture(u_texture0, v_texCoord);
  float srcAlpha = texture(u_texture1, v_texCoord).a;
  fragColor = glow * srcAlpha;
}";

/// Clips `glow` to `source` alpha (output = glow × source.a), writing to `dest`.
/// Shared by inner glow and inner shadow to confine the effect inside the shape.
pub fn apply_gl_inner_clip_pass(
    state: &GlRenderState,
    glow: &GlRenderTarget,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
) {
    let program = get_gl_inner_clip_shader(state);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[glow.texture, source.texture],
        Some(dest),
        |_, _| {},
    );
}

/// Applies an inner glow filter to `source`, writing the result to `dest`.
pub fn apply_inner_glow_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    scratch: &[&GlRenderTarget; 3],
    filter: &InnerGlowFilter,
) {
    let color = filter.color.unwrap_or(0xff0000);
    let alpha = filter.alpha.unwrap_or(1.0);
    let strength = filter.strength.unwrap_or(1.0);
    let quality = filter.quality.unwrap_or(1).max(1);

    let s0 = scratch[0];
    let s1 = scratch[1];
    let s2 = scratch[2];

    // Pass 1: invert source alpha, tint with glow color → s0.
    apply_gl_invert_tint_pass(state, source, s0, color, alpha, strength);

    // Pass 2: blur → s1 (s2 is ping-pong temp).
    apply_box_blur_filter_to_gl(
        state,
        s0,
        s1,
        s2,
        filter.blur_x.unwrap_or(6.0),
        filter.blur_y.unwrap_or(6.0),
        quality,
    );

    // Pass 3: clip blurred glow (s1) to source alpha → s0 (cleared first).
    clear_gl_render_target(state, s0);
    apply_gl_inner_clip_pass(state, s1, source, s0);

    // Final composite: source first, then clipped glow on top.
    clear_gl_render_target(state, dest);
    apply_gl_blit_pass(state, source, dest);
    apply_gl_blit_pass(state, s0, dest);
}

/// Returns the inner-clip shader program for `state`, compiling on first use.
pub fn get_gl_inner_clip_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, INNER_CLIP_FRAGMENT_SRC, |p| &mut p.inner_clip)
}

#[cfg(test)]
mod tests {
    use super::*;

    // INNER_CLIP_FRAGMENT_SRC

    #[test]
    fn inner_clip_fragment_src_multiplies_glow_by_source_alpha() {
        assert!(INNER_CLIP_FRAGMENT_SRC.contains("fragColor = glow * srcAlpha"));
        assert!(INNER_CLIP_FRAGMENT_SRC.contains("uniform sampler2D u_texture1"));
    }
}
