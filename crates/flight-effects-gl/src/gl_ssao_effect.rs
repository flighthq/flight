// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! SSAO: ambient-occlusion approximation. Real SSAO reconstructs view-space position/normals from a
//! sampleable DEPTH texture and accumulates occlusion over `samples` kernel offsets within `radius`,
//! gated by `bias`; none of that depth data exists in the color-only context. This stand-in darkens
//! fragments by local luminance variation (high-contrast neighborhoods read as creases/contact) scaled
//! by intensity, sampling neighbors via u_resolution-derived texel steps.

use flight_effects::{Effect, SsaoEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const SSAO_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_intensity;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = (1.0 / u_resolution) * max(u_radius, 1.0);
  vec4 center = texture(u_texture0, v_texCoord);
  float lc = luma(center.rgb);
  float variation = 0.0;
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb));
  variation *= 0.25;
  float occlusion = clamp(variation * u_intensity, 0.0, 1.0);
  o_color = vec4(center.rgb * (1.0 - occlusion), center.a);
}"#;

pub fn apply_ssao_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &SsaoEffect,
) -> Result<(), String> {
    let radius = effect.radius.unwrap_or(1.0);
    let intensity = effect.intensity.unwrap_or(1.0);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "atmospheric.ssao", SSAO_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_2f(gl, p, "u_resolution", width, height);
        uniform_1f(gl, p, "u_radius", radius);
        uniform_1f(gl, p, "u_intensity", intensity);
    });
}

pub fn gl_ssao_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<SsaoEffect>() else {
        return Ok(());
    };
    return apply_ssao_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_ssao_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "SsaoEffect", gl_ssao_effect_runner, None);
}
