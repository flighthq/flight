// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Directional blur: accumulate samples stepped along `angle` over `length` texels, normalized by the
//! sample count. Single-pass reference recipe. u_resolution converts the texel length into UV space.
//! The sin(angle) component is negated in the shader to convert the screen-space-Y-down angle into
//! the GL fullscreen-pass UV-Y-up direction.

use flight_effects::{DirectionalBlurEffect, Effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const DIRECTIONAL_BLUR_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_angle;
uniform float u_length;
uniform float u_samples;
uniform vec2 u_resolution;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  // Negate sin to convert screen-space-Y-down angle to GL UV-Y-up direction.
  vec2 dir = vec2(cos(u_angle), -sin(u_angle)) * (u_length / u_resolution);
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    float t = count > 1.0 ? (float(i) / (count - 1.0)) - 0.5 : 0.0;
    vec2 uv = v_texCoord + dir * t;
    sum += texture(u_texture0, uv);
    taken += 1.0;
  }
  o_color = sum / max(taken, 1.0);
}"#;

pub fn apply_directional_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &DirectionalBlurEffect,
) -> Result<(), String> {
    let angle = (effect.angle.unwrap_or(0.0) * std::f32::consts::PI) / 180.0;
    let length = effect.length.unwrap_or(8.0);
    let samples = effect.samples.unwrap_or(16.0);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "directionalBlur", DIRECTIONAL_BLUR_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_angle", angle);
        uniform_1f(gl, p, "u_length", length);
        uniform_1f(gl, p, "u_samples", samples);
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_directional_blur_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<DirectionalBlurEffect>() else {
        return Ok(());
    };
    return apply_directional_blur_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_directional_blur_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "DirectionalBlurEffect",
        gl_directional_blur_effect_runner,
        None,
    );
}
