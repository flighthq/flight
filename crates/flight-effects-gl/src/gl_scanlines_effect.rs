// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Scanlines: darken by a vertical sine band; `count` sets the line density, `intensity` the
//! darkening.

use flight_effects::{Effect, ScanlinesEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const SCANLINES_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_count;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  // Counted down the image so a given line index falls on the same row whichever origin the target
  // uses; a render target is bottom-left, so the row has to be measured from the far edge first.
  float line = sin((1.0 - v_texCoord.y) * u_count * 3.14159265) * 0.5 + 0.5;
  o_color = vec4(c.rgb * (1.0 - u_intensity * (1.0 - line)), c.a);
}"#;

pub fn apply_scanlines_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &ScanlinesEffect,
) -> Result<(), String> {
    let count = effect.count.unwrap_or(240.0);
    let intensity = effect.intensity.unwrap_or(0.3);
    let program = get_gl_effect_program(state, "stylization.scanlines", SCANLINES_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_count", count);
        uniform_1f(gl, p, "u_intensity", intensity);
    });
}

pub fn gl_scanlines_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<ScanlinesEffect>() else {
        return Ok(());
    };
    return apply_scanlines_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_scanlines_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "ScanlinesEffect", gl_scanlines_effect_runner, None);
}
