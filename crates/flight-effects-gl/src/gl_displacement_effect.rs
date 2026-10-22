// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Displacement / heat-haze: warp the sample uv by an animated sine field for a refractive wobble.

use flight_effects::{DisplacementEffect, Effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const DISPLACEMENT_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_frequency;
uniform float u_seed;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  float f = u_frequency;
  // The warp is defined in IMAGE space, which is what makes the same seed produce the same picture on
  // a bottom-left-origin target as on a top-left one. Two separate conversions are needed and they are
  // easy to mistake for one: the sine PHASE reads an image-space row, and the vertical offset is then
  // negated on the way back out, because moving down the image is moving down this target's y.
  float imageY = 1.0 - v_texCoord.y;
  vec2 warp = vec2(
    sin(imageY * f + u_seed) + sin(imageY * f * 2.3 + u_seed * 1.7) * 0.5,
    cos(v_texCoord.x * f * 0.8 + u_seed * 1.3)
  );
  vec2 offset = warp * (u_intensity / u_resolution);
  vec2 displaced = vec2(v_texCoord.x + offset.x, v_texCoord.y - offset.y);
  o_color = texture(u_texture0, displaced);
}"#;

pub fn apply_displacement_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &DisplacementEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(8.0);
    let frequency = effect.frequency.unwrap_or(12.0);
    let seed = effect.seed.unwrap_or(0.0);
    let resolution_x = source.axes.width as f32;
    let resolution_y = source.axes.height as f32;
    let program = get_gl_effect_program(state, "lens.displacement", DISPLACEMENT_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_frequency", frequency);
        uniform_1f(gl, p, "u_seed", seed);
        uniform_2f(gl, p, "u_resolution", resolution_x, resolution_y);
    });
}

pub fn gl_displacement_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<DisplacementEffect>() else {
        return Ok(());
    };
    return apply_displacement_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_displacement_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "DisplacementEffect",
        gl_displacement_effect_runner,
        None,
    );
}
