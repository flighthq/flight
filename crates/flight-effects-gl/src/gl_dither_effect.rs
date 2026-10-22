// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Dither: quantize each channel to `levels` steps with a 4x4 ordered Bayer threshold for a retro
//! banded-but-textured look.

use flight_effects::{DitherEffect, Effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const DITHER_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
uniform vec2 u_resolution;
out vec4 o_color;
float bayer(ivec2 p) {
  int x = p.x & 3;
  int y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  ivec2 px = ivec2(v_texCoord * u_resolution);
  float t = bayer(px) - 0.5;
  float steps = u_levels - 1.0;
  vec3 q = floor(c.rgb * steps + 0.5 + t) / steps;
  o_color = vec4(clamp(q, 0.0, 1.0), c.a);
}"#;

pub fn apply_dither_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &DitherEffect,
) -> Result<(), String> {
    let levels = effect.levels.unwrap_or(4.0);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.dither", DITHER_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_levels", levels.max(2.0));
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_dither_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<DitherEffect>() else {
        return Ok(());
    };
    return apply_dither_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_dither_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "DitherEffect", gl_dither_effect_runner, None);
}
