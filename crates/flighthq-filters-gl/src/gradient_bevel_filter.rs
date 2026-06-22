//! Gradient-bevel GL filter pass.
//!
//! The gradient maps bevel depth (shadow edge → highlight edge) to colors.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates a temporary GL texture internally on each call
//! (the gradient ramp); it is deleted before the function returns.

use flighthq_filters::BevelType;
use flighthq_filters::GradientBevelFilter;
use glow::HasContext;

use crate::blur_filter::apply_box_blur_filter_to_gl;
use crate::filter_pass::{
    GlFullscreenProgram, clear_gl_render_target, draw_gl_fullscreen_pass, get_gl_filter_program,
};
use crate::gradient_ramp::create_gl_gradient_ramp_texture;
use crate::tint_shader::{apply_gl_blit_pass, apply_gl_tint_pass};
use crate::{GlRenderState, GlRenderTarget};

// Samples the blurred alpha at +offset and -offset to compute a bevel value in
// [-1, 1], mapped to [0, 1] for gradient lookup. Encoded into the red channel.
const BEVEL_ENCODE_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_offset;
out vec4 fragColor;
void main() {
  float high = texture(u_texture, v_texCoord - u_offset).a;
  float low = texture(u_texture, v_texCoord + u_offset).a;
  float bevelVal = clamp((high - low) * 0.5 + 0.5, 0.0, 1.0);
  fragColor = vec4(bevelVal, 0.0, 0.0, 1.0);
}";

// Looks up the encoded bevel value (in .r) in the gradient ramp and clips the
// result to the source alpha (unit 2 holds the source).
const BEVEL_APPLY_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_ramp;
uniform sampler2D u_source;
out vec4 fragColor;
void main() {
  float bevelVal = texture(u_texture, v_texCoord).r;
  vec4 color = texture(u_ramp, vec2(bevelVal, 0.5));
  float srcAlpha = texture(u_source, v_texCoord).a;
  fragColor = color * srcAlpha;
}";

/// Applies a gradient bevel filter to `source`, writing the result to `dest`.
pub fn apply_gradient_bevel_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    scratch: &[&GlRenderTarget; 3],
    filter: &GradientBevelFilter,
) {
    let angle = filter.angle.unwrap_or(45.0).to_radians();
    let distance = filter.distance.unwrap_or(4.0);
    let quality = filter.quality.unwrap_or(1).max(1);
    let strength = filter.strength.unwrap_or(1.0);

    let s0 = scratch[0];
    let s1 = scratch[1];
    let s2 = scratch[2];

    // Build the blur basis → s1.
    apply_gl_tint_pass(state, source, s0, 0xffffff, 1.0, strength.min(1.0));
    apply_box_blur_filter_to_gl(
        state,
        s0,
        s1,
        s2,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        quality,
    );

    // Encode bevel value from blurred alpha offset samples → s0.
    let dx = angle.cos() * distance;
    let dy = angle.sin() * distance;
    apply_bevel_encode_pass(state, s1, s0, dx / s1.width as f32, dy / s1.height as f32);

    // Build gradient ramp, apply to the encoded bevel clipped to source alpha → s1.
    let ratios: Vec<u8> = filter.ratios.iter().map(|&r| r.round().clamp(0.0, 255.0) as u8).collect();
    let ramp = create_gl_gradient_ramp_texture(state, &filter.colors, &filter.alphas, &ratios);
    apply_bevel_apply_pass(state, s0, ramp, source, s1);
    unsafe {
        state.gl.delete_texture(ramp);
    }

    clear_gl_render_target(state, dest);
    // Full bevel composites the source under the bevel; inner/outer omit the base source.
    if filter.bevel_type.unwrap_or(BevelType::Full) == BevelType::Full {
        apply_gl_blit_pass(state, source, dest);
    }
    apply_gl_blit_pass(state, s1, dest);
}

/// Returns the bevel-apply shader program for `state`, compiling on first use.
pub fn get_gradient_bevel_apply_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, BEVEL_APPLY_FRAGMENT_SRC, |p| &mut p.gradient_bevel_apply)
}

/// Returns the bevel-encode shader program for `state`, compiling on first use.
pub fn get_gradient_bevel_encode_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, BEVEL_ENCODE_FRAGMENT_SRC, |p| &mut p.gradient_bevel_encode)
}

// Encodes the bevel value from offset alpha samples of the blurred basis.
fn apply_bevel_encode_pass(
    state: &GlRenderState,
    blurred: &GlRenderTarget,
    dest: &GlRenderTarget,
    dx: f32,
    dy: f32,
) {
    let program = get_gradient_bevel_encode_shader(state);
    draw_gl_fullscreen_pass(state, program, &[blurred.texture], Some(dest), move |gl, p| unsafe {
        gl.uniform_2_f32(gl.get_uniform_location(p, "u_offset").as_ref(), dx, dy);
    });
}

// Looks up the encoded bevel (unit 0) in the ramp (unit 1), clipped to source
// alpha (unit 2).
fn apply_bevel_apply_pass(
    state: &GlRenderState,
    encoded: &GlRenderTarget,
    ramp: glow::Texture,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
) {
    let source_texture = source.texture;
    let program = get_gradient_bevel_apply_shader(state);
    draw_gl_fullscreen_pass(state, program, &[encoded.texture], Some(dest), move |gl, p| unsafe {
        gl.active_texture(glow::TEXTURE1);
        gl.bind_texture(glow::TEXTURE_2D, Some(ramp));
        gl.uniform_1_i32(gl.get_uniform_location(p, "u_ramp").as_ref(), 1);
        gl.active_texture(glow::TEXTURE2);
        gl.bind_texture(glow::TEXTURE_2D, Some(source_texture));
        gl.uniform_1_i32(gl.get_uniform_location(p, "u_source").as_ref(), 2);
        gl.active_texture(glow::TEXTURE0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    // BEVEL_APPLY_FRAGMENT_SRC

    #[test]
    fn bevel_apply_fragment_src_clips_ramp_to_source_alpha() {
        assert!(BEVEL_APPLY_FRAGMENT_SRC.contains("uniform sampler2D u_source"));
        assert!(BEVEL_APPLY_FRAGMENT_SRC.contains("fragColor = color * srcAlpha"));
    }

    // BEVEL_ENCODE_FRAGMENT_SRC

    #[test]
    fn bevel_encode_fragment_src_maps_bevel_to_red_channel() {
        assert!(BEVEL_ENCODE_FRAGMENT_SRC.contains("(high - low) * 0.5 + 0.5"));
        assert!(BEVEL_ENCODE_FRAGMENT_SRC.contains("fragColor = vec4(bevelVal, 0.0, 0.0, 1.0)"));
    }
}
