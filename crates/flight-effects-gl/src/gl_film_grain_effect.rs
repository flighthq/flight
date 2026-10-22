// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Film grain: add per-pixel hash noise scaled by intensity, with grain cell size and a seed so the
//! noise can be animated frame to frame.

use flight_effects::{Effect, FilmGrainEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const FILM_GRAIN_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_size;
uniform float u_seed;
out vec4 o_color;
float hash(vec2 p) {
  p = floor(p / u_size);
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453123);
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float n = hash(v_texCoord * 1024.0) - 0.5;
  o_color = vec4(c.rgb + n * u_intensity, c.a);
}"#;

pub fn apply_film_grain_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &FilmGrainEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(0.1);
    let size = effect.size.unwrap_or(1.0);
    let seed = effect.seed.unwrap_or(0.0);
    let program = get_gl_effect_program(state, "stylization.filmGrain", FILM_GRAIN_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_size", size.max(0.0001));
        uniform_1f(gl, p, "u_seed", seed);
    });
}

pub fn gl_film_grain_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<FilmGrainEffect>() else {
        return Ok(());
    };
    return apply_film_grain_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_film_grain_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "FilmGrainEffect", gl_film_grain_effect_runner, None);
}
