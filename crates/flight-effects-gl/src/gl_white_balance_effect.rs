// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! White balance: warm/cool temperature and magenta/green tint channel shift.

use flight_effects::{Effect, WhiteBalanceEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const WHITE_BALANCE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_temperature;
uniform float u_tint;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb;
  rgb.r += u_temperature * 0.5;
  rgb.b -= u_temperature * 0.5;
  rgb.g += u_tint * 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}"#;

pub fn apply_white_balance_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &WhiteBalanceEffect,
) -> Result<(), String> {
    let temperature = effect.temperature.unwrap_or(0.0);
    let tint = effect.tint.unwrap_or(0.0);
    let program =
        get_gl_effect_program(state, "colorGrade.whiteBalance", WHITE_BALANCE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_temperature", temperature);
        uniform_1f(gl, p, "u_tint", tint);
    });
}

pub fn gl_white_balance_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<WhiteBalanceEffect>() else {
        return Ok(());
    };
    return apply_white_balance_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_white_balance_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "WhiteBalanceEffect",
        gl_white_balance_effect_runner,
        None,
    );
}
