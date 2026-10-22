// flight-lint: allow-file(contract-vocabulary) D17 shared GL effect passes draw native glow targets and return Result diagnostics
//! Shared blit, offset-blit and erase passes used by the glow/shadow/bevel family.

use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::gl_effect_support::{
    get_gl_effect_shader, set_blend_func, set_uniform_2f, uniform_location,
};

// Blits a tinted texture at a UV offset. Out-of-bounds samples produce transparent output.
const BLIT_OFFSET_FRAGMENT_SRC: &str = r#"#version 300 es
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
}"#;

// Pass-through blit.
const BLIT_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}"#;

// Emits source alpha for a destination-out erase pass; blend state supplies the coverage operator.
const ERASE_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  float a = texture(u_texture, v_texCoord).a;
  fragColor = vec4(0.0, 0.0, 0.0, a);
}"#;

/// Blits source into dest at a pixel offset (dx, dy in screen-space Y-down). Pixels sampling
/// outside the source bounds produce transparent output.
pub fn apply_gl_effect_blit_offset_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    dx: f32,
    dy: f32,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "blitOffset", BLIT_OFFSET_FRAGMENT_SRC)?;
    let location = uniform_location(&state.gl, &program, "u_offset");
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, _p| {
        set_uniform_2f(gl, location.as_ref(), -dx / width, dy / height);
    });
}

/// Blits source directly into dest without modification.
pub fn apply_gl_effect_blit_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "blit", BLIT_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |_gl, _p| {});
}

/// Erases dest by the source alpha mask, equivalent to destination-out compositing.
pub fn apply_gl_effect_erase_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "erase", ERASE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, _p| {
        set_blend_func(gl, glow::ZERO, glow::ONE_MINUS_SRC_ALPHA);
    });
}
