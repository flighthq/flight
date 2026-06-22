//! Tint, invert-tint, blit, and blit-offset shaders shared by the GL filter passes.
//!
//! These shaders are the fundamental building blocks for most bitmap effects:
//! - `apply_gl_tint_pass`: extracts source alpha, tints with solid color → premultiplied RGBA.
//! - `apply_gl_invert_tint_pass`: same but uses inverted alpha (inner effects).
//! - `apply_gl_blit_pass`: pass-through copy.
//! - `apply_gl_blit_offset_pass`: copy at a pixel offset (transparent outside bounds).
//!
//! Programs are cached per `GlRenderState` and retrieved via the corresponding
//! `get_gl_*_shader` accessors.

use glow::HasContext;

use crate::filter_pass::{GlFullscreenProgram, draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::{GlRenderState, GlRenderTarget};

// Extracts the source alpha, tints it with a solid color, outputs premultiplied RGBA.
const TINT_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_color;
uniform float u_alpha;
uniform float u_strength;
out vec4 fragColor;
void main() {
  float a = min(1.0, texture(u_texture, v_texCoord).a * u_alpha * u_strength);
  fragColor = vec4(u_color * a, a);
}";

// Extracts the INVERTED source alpha, tints it. Used for inner glow/shadow.
const INVERT_TINT_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_color;
uniform float u_alpha;
uniform float u_strength;
out vec4 fragColor;
void main() {
  float a = min(1.0, (1.0 - texture(u_texture, v_texCoord).a) * u_alpha * u_strength);
  fragColor = vec4(u_color * a, a);
}";

// Blits a texture at a UV offset. Out-of-bounds samples produce transparent output.
const BLIT_OFFSET_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_offset;
out vec4 fragColor;
void main() {
  vec2 uv = v_texCoord + u_offset;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0);
    return;
  }
  fragColor = texture(u_texture, uv);
}";

// Pass-through blit.
const BLIT_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}";

/// Blits `source` into `dest` at pixel offset `(dx, dy)` (screen-space Y-down).
/// Pixels that sample outside the source bounds produce transparent output.
pub fn apply_gl_blit_offset_pass(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    dx: f32,
    dy: f32,
) {
    let program = get_gl_blit_offset_shader(state);
    let (ox, oy) = (-dx / source.width as f32, dy / source.height as f32);
    draw_gl_fullscreen_pass(state, program, &[source.texture], Some(dest), move |gl, p| unsafe {
        gl.uniform_2_f32(gl.get_uniform_location(p, "u_offset").as_ref(), ox, oy);
    });
}

/// Blits `source` directly into `dest` without modification.
pub fn apply_gl_blit_pass(state: &GlRenderState, source: &GlRenderTarget, dest: &GlRenderTarget) {
    let program = get_gl_blit_shader(state);
    draw_gl_fullscreen_pass(state, program, &[source.texture], Some(dest), |_, _| {});
}

/// Tints the INVERTED source alpha with `color`, outputting a premultiplied
/// mask into `dest`. Used as the first pass for inner glow and inner shadow.
pub fn apply_gl_invert_tint_pass(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let program = get_gl_invert_tint_shader(state);
    apply_tint(state, program, source, dest, color, alpha, strength);
}

/// Tints the source alpha with `color`, outputting a premultiplied mask into
/// `dest`. Provides the colored spread for outer glow, drop shadow, etc.
pub fn apply_gl_tint_pass(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let program = get_gl_tint_shader(state);
    apply_tint(state, program, source, dest, color, alpha, strength);
}

/// Returns the blit-offset shader program for `state`, compiling on first use.
pub fn get_gl_blit_offset_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, BLIT_OFFSET_FRAGMENT_SRC, |p| &mut p.blit_offset)
}

/// Returns the plain blit shader program for `state`, compiling on first use.
pub fn get_gl_blit_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, BLIT_FRAGMENT_SRC, |p| &mut p.blit)
}

/// Returns the invert-tint shader program for `state`, compiling on first use.
pub fn get_gl_invert_tint_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, INVERT_TINT_FRAGMENT_SRC, |p| &mut p.invert_tint)
}

/// Returns the tint shader program for `state`, compiling on first use.
pub fn get_gl_tint_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, TINT_FRAGMENT_SRC, |p| &mut p.tint)
}

// Shared tint upload — both tint and invert-tint use the same uniform set.
fn apply_tint(
    state: &GlRenderState,
    program: &GlFullscreenProgram,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let (r, g, b) = unpack_color(color);
    draw_gl_fullscreen_pass(state, program, &[source.texture], Some(dest), move |gl, p| unsafe {
        gl.uniform_3_f32(gl.get_uniform_location(p, "u_color").as_ref(), r, g, b);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_alpha").as_ref(), alpha);
        gl.uniform_1_f32(gl.get_uniform_location(p, "u_strength").as_ref(), strength);
    });
}

// Unpacks a packed-RGB integer (0xRRGGBB) into straight float channels in [0, 1].
fn unpack_color(color: u32) -> (f32, f32, f32) {
    (
        ((color >> 16) & 0xff) as f32 / 255.0,
        ((color >> 8) & 0xff) as f32 / 255.0,
        (color & 0xff) as f32 / 255.0,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    // BLIT_FRAGMENT_SRC / shader sources

    #[test]
    fn blit_fragment_src_samples_texture_directly() {
        assert!(BLIT_FRAGMENT_SRC.contains("fragColor = texture(u_texture, v_texCoord)"));
    }

    #[test]
    fn blit_offset_fragment_src_clips_out_of_bounds() {
        assert!(BLIT_OFFSET_FRAGMENT_SRC.contains("uniform vec2 u_offset"));
        assert!(BLIT_OFFSET_FRAGMENT_SRC.contains("uv.x < 0.0 || uv.x > 1.0"));
    }

    #[test]
    fn invert_tint_fragment_src_inverts_source_alpha() {
        assert!(INVERT_TINT_FRAGMENT_SRC.contains("(1.0 - texture(u_texture, v_texCoord).a)"));
    }

    #[test]
    fn tint_fragment_src_outputs_premultiplied_color() {
        assert!(TINT_FRAGMENT_SRC.contains("fragColor = vec4(u_color * a, a)"));
    }

    // unpack_color

    #[test]
    fn unpack_color_black_is_zero() {
        assert_eq!(unpack_color(0x000000), (0.0, 0.0, 0.0));
    }

    #[test]
    fn unpack_color_splits_red_green_blue() {
        let (r, g, b) = unpack_color(0x4080c0);
        assert!((r - 0x40 as f32 / 255.0).abs() < 1e-6);
        assert!((g - 0x80 as f32 / 255.0).abs() < 1e-6);
        assert!((b - 0xc0 as f32 / 255.0).abs() < 1e-6);
    }
}
