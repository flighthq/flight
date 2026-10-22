// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Posterize: floor each channel to `levels` discrete steps.

use flight_effects::{Effect, PosterizeEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const POSTERIZE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = floor(c.rgb * u_levels) / (u_levels - 1.0);
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}"#;

pub fn apply_posterize_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &PosterizeEffect,
) -> Result<(), String> {
    let levels = effect.levels.unwrap_or(8.0).max(2.0);
    let program = get_gl_effect_program(state, "colorGrade.posterize", POSTERIZE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_levels", levels);
    });
}

pub fn gl_posterize_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<PosterizeEffect>() else {
        return Ok(());
    };
    return apply_posterize_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_posterize_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "PosterizeEffect", gl_posterize_effect_runner, None);
}
