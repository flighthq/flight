// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Sharpen: unsharp mask via a 3x3 Laplacian kernel; `amount` scales the high-frequency boost.

use flight_effects::{Effect, SharpenEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const SHARPEN_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec3 c = texture(u_texture0, v_texCoord).rgb;
  vec3 n = texture(u_texture0, v_texCoord + vec2(0.0, -texel.y)).rgb;
  vec3 s = texture(u_texture0, v_texCoord + vec2(0.0, texel.y)).rgb;
  vec3 e = texture(u_texture0, v_texCoord + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture(u_texture0, v_texCoord + vec2(-texel.x, 0.0)).rgb;
  vec3 high = c * 4.0 - n - s - e - w;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(clamp(c + high * u_amount, 0.0, 1.0), a);
}"#;

pub fn apply_sharpen_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &SharpenEffect,
) -> Result<(), String> {
    let amount = effect.amount.unwrap_or(0.5);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.sharpen", SHARPEN_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_amount", amount);
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_sharpen_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<SharpenEffect>() else {
        return Ok(());
    };
    return apply_sharpen_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_sharpen_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "SharpenEffect", gl_sharpen_effect_runner, None);
}
