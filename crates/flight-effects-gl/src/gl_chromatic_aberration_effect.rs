// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Chromatic aberration: sample the R/G/B channels at progressively larger offsets so colors fringe
//! apart. When radial, the offset scales with distance from the optical center; otherwise it is a
//! uniform horizontal split.

use flight_effects::{ChromaticAberrationEffect, Effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const CHROMATIC_ABERRATION_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radial;
out vec4 o_color;
void main() {
  vec2 centered = v_texCoord - 0.5;
  float scale = mix(1.0, length(centered) * 2.0, u_radial);
  // Negate epsilon Y: GL UV Y-up vs WGPU UV Y-down. The epsilon is a divide-by-zero guard for
  // normalize(); its Y must match the screen-space convention to avoid a direction flip at center.
  vec2 dir = mix(vec2(1.0, 0.0), normalize(centered + vec2(1e-5, -1e-5)), u_radial);
  vec2 offset = dir * u_intensity * scale;
  float r = texture(u_texture0, v_texCoord + offset).r;
  float g = texture(u_texture0, v_texCoord).g;
  float b = texture(u_texture0, v_texCoord - offset).b;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(r, g, b, a);
}"#;

pub fn apply_chromatic_aberration_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &ChromaticAberrationEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(0.005);
    let radial = effect.radial.unwrap_or(true);
    let program = get_gl_effect_program(
        state,
        "lens.chromaticAberration",
        CHROMATIC_ABERRATION_FRAGMENT_SRC,
    )?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_radial", if radial { 1.0 } else { 0.0 });
    });
}

pub fn gl_chromatic_aberration_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<ChromaticAberrationEffect>() else {
        return Ok(());
    };
    return apply_chromatic_aberration_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_chromatic_aberration_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "ChromaticAberrationEffect",
        gl_chromatic_aberration_effect_runner,
        None,
    );
}
