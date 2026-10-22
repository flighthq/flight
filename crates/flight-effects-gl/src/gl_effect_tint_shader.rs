// flight-lint: allow-file(contract-vocabulary) D17 shared GL effect passes draw native glow targets and return Result diagnostics
//! Shared tint and inverted-tint mask passes used by the glow/shadow family.

use flight_color::unpack_color_rgba;
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::gl_effect_support::{
    get_gl_effect_shader, set_blend_func, set_uniform_1f, set_uniform_3f, uniform_location,
};

// Extracts the source alpha, tints it with a solid color, and outputs a
// premultiplied RGBA texture.
const TINT_FRAGMENT_SRC: &str = r#"#version 300 es
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
}"#;

// Extracts the INVERTED source alpha, tints it with a solid color, and outputs
// a premultiplied RGBA texture. Used as the first pass for inner glow/shadow.
const INVERT_TINT_FRAGMENT_SRC: &str = r#"#version 300 es
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
}"#;

/// Tints the INVERTED source alpha with `color` (packed 0xRRGGBBAA), outputs a premultiplied mask.
/// Used for inner effects.
pub fn apply_gl_effect_invert_tint_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) -> Result<(), String> {
    return apply_gl_effect_tint(
        state,
        "invertTint",
        INVERT_TINT_FRAGMENT_SRC,
        source,
        dest,
        color,
        alpha,
        strength,
    );
}

fn apply_gl_effect_tint(
    state: &mut GlRenderState,
    key: &str,
    fragment_source: &str,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, key, fragment_source)?;
    let loc_color = uniform_location(&state.gl, &program, "u_color");
    let loc_alpha = uniform_location(&state.gl, &program, "u_alpha");
    let loc_strength = uniform_location(&state.gl, &program, "u_strength");
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, _p| {
        let mut tint = [0.0_f32; 4];
        unpack_color_rgba(&mut tint, color);
        set_uniform_3f(gl, loc_color.as_ref(), tint[0], tint[1], tint[2]);
        set_uniform_1f(gl, loc_alpha.as_ref(), alpha * tint[3]);
        set_uniform_1f(gl, loc_strength.as_ref(), strength);
        set_blend_func(gl, glow::ONE, glow::ZERO);
    });
}

/// Tints the source alpha with `color` (packed 0xRRGGBBAA), outputs a premultiplied mask into dest.
pub fn apply_gl_effect_tint_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) -> Result<(), String> {
    return apply_gl_effect_tint(
        state,
        "tint",
        TINT_FRAGMENT_SRC,
        source,
        dest,
        color,
        alpha,
        strength,
    );
}
