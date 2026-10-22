// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Sketch: detect luminance edges and invert them into dark pencil strokes over a light page; `strength`
//! scales how dark the strokes get.

use flight_effects::{Effect, SketchEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const SKETCH_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_strength;
uniform vec2 u_resolution;
out vec4 o_color;
float lum(vec2 uv) {
  return dot(texture(u_texture0, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  float tl = lum(v_texCoord + texel * vec2(-1.0, -1.0));
  float t = lum(v_texCoord + texel * vec2(0.0, -1.0));
  float tr = lum(v_texCoord + texel * vec2(1.0, -1.0));
  float l = lum(v_texCoord + texel * vec2(-1.0, 0.0));
  float rr = lum(v_texCoord + texel * vec2(1.0, 0.0));
  float bl = lum(v_texCoord + texel * vec2(-1.0, 1.0));
  float b = lum(v_texCoord + texel * vec2(0.0, 1.0));
  float br = lum(v_texCoord + texel * vec2(1.0, 1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);
  float pencil = clamp(1.0 - edge * u_strength, 0.0, 1.0);
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(vec3(pencil), a);
}"#;

pub fn apply_sketch_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &SketchEffect,
) -> Result<(), String> {
    let strength = effect.strength.unwrap_or(1.0);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.sketch", SKETCH_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_strength", strength);
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_sketch_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<SketchEffect>() else {
        return Ok(());
    };
    return apply_sketch_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_sketch_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "SketchEffect", gl_sketch_effect_runner, None);
}
