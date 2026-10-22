// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Vignette: darken toward the edges. Pixels inside `radius` stay full bright; beyond it, brightness
//! falls off over `softness` and the color is blended toward the (unpacked) vignette color by intensity.

use flight_effects::{Effect, VignetteEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_4f};

const VIGNETTE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radius;
uniform float u_softness;
uniform vec4 u_color;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec2 centered = v_texCoord - 0.5;
  float dist = length(centered) * 1.41421356;
  float vig = smoothstep(u_radius, u_radius - u_softness, dist);
  float darken = (1.0 - vig) * u_intensity * u_color.a;
  o_color = vec4(mix(c.rgb, u_color.rgb, darken), c.a);
}"#;

pub fn apply_vignette_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &VignetteEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(1.0);
    let radius = effect.radius.unwrap_or(0.75);
    let softness = effect.softness.unwrap_or(0.45);
    let color = effect.color.unwrap_or(0x000000ff);
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    let program = get_gl_effect_program(state, "lens.vignette", VIGNETTE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_radius", radius);
        uniform_1f(gl, p, "u_softness", softness);
        uniform_4f(gl, p, "u_color", r, g, b, a);
    });
}

pub fn gl_vignette_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<VignetteEffect>() else {
        return Ok(());
    };
    return apply_vignette_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_vignette_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "VignetteEffect", gl_vignette_effect_runner, None);
}
