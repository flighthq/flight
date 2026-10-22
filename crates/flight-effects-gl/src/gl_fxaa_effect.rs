// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! FXAA: luminance edge detection + directional blend along the detected edge. Single-pass reference
//! recipe. Reads u_texture0; u_resolution gives the texel size; u_edgeThreshold gates edge detection.

use flight_effects::{Effect, FxaaEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const FXAA_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_edgeThreshold;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec3 rgbM = texture(u_texture0, v_texCoord).rgb;
  vec3 rgbNW = texture(u_texture0, v_texCoord + vec2(-1.0, -1.0) * texel).rgb;
  vec3 rgbNE = texture(u_texture0, v_texCoord + vec2(1.0, -1.0) * texel).rgb;
  vec3 rgbSW = texture(u_texture0, v_texCoord + vec2(-1.0, 1.0) * texel).rgb;
  vec3 rgbSE = texture(u_texture0, v_texCoord + vec2(1.0, 1.0) * texel).rgb;
  float lumaM = luma(rgbM);
  float lumaNW = luma(rgbNW);
  float lumaNE = luma(rgbNE);
  float lumaSW = luma(rgbSW);
  float lumaSE = luma(rgbSE);
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  float range = lumaMax - lumaMin;
  if (range < max(u_edgeThreshold, lumaMax * 0.125)) {
    o_color = vec4(rgbM, texture(u_texture0, v_texCoord).a);
    return;
  }
  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * texel;
  vec3 rgbA = 0.5 * (
    texture(u_texture0, v_texCoord + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture(u_texture0, v_texCoord + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture(u_texture0, v_texCoord + dir * -0.5).rgb +
    texture(u_texture0, v_texCoord + dir * 0.5).rgb);
  float lumaB = luma(rgbB);
  vec3 result = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
  o_color = vec4(result, texture(u_texture0, v_texCoord).a);
}"#;

pub fn apply_fxaa_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &FxaaEffect,
) -> Result<(), String> {
    let edge_threshold = effect.edge_threshold.unwrap_or(0.0312);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "antialiasing.fxaa", FXAA_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_2f(gl, p, "u_resolution", width, height);
        uniform_1f(gl, p, "u_edgeThreshold", edge_threshold);
    });
}

pub fn gl_fxaa_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<FxaaEffect>() else {
        return Ok(());
    };
    return apply_fxaa_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_fxaa_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "FxaaEffect", gl_fxaa_effect_runner, None);
}
