// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! SMAA: a single-pass edge-aware blur approximation. Full SMAA needs separate edge-detection and
//! blend-weight passes against precomputed area/search lookup textures; this single-pass approximation
//! softens detected edges only and is acceptable until the multi-pass recipe lands.

use flight_effects::{Effect, SmaaEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const SMAA_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_threshold;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 center = texture(u_texture0, v_texCoord);
  float lumaC = luma(center.rgb);
  float lumaL = luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb);
  float lumaR = luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb);
  float lumaT = luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb);
  float lumaB = luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb);
  float edge = max(abs(lumaC - lumaL), max(abs(lumaC - lumaR), max(abs(lumaC - lumaT), abs(lumaC - lumaB))));
  if (edge < u_threshold) {
    o_color = center;
    return;
  }
  vec3 blurred = (
    texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb +
    texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb +
    center.rgb) / 5.0;
  o_color = vec4(blurred, center.a);
}"#;

pub fn apply_smaa_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &SmaaEffect,
) -> Result<(), String> {
    let threshold = effect.threshold.unwrap_or(0.1);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "antialiasing.smaa", SMAA_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_2f(gl, p, "u_resolution", width, height);
        uniform_1f(gl, p, "u_threshold", threshold);
    });
}

pub fn gl_smaa_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<SmaaEffect>() else {
        return Ok(());
    };
    return apply_smaa_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_smaa_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "SmaaEffect", gl_smaa_effect_runner, None);
}
