// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Outline: Sobel edge detection on luminance; where the gradient magnitude exceeds `threshold`, mix
//! the pixel toward the outline color by `thickness`. Color arrives packed RGBA, unpacked to 0..1 here.

use flight_effects::{Effect, OutlineEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f, uniform_4f};

const OUTLINE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
uniform float u_thickness;
uniform vec4 u_color;
uniform vec2 u_resolution;
out vec4 o_color;
float lum(vec2 uv) {
  return dot(texture(u_texture0, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec2 texel = u_thickness / u_resolution;
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
  vec4 c = texture(u_texture0, v_texCoord);
  float k = step(u_threshold, edge);
  o_color = mix(c, u_color, k * u_color.a);
}"#;

pub fn apply_outline_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &OutlineEffect,
) -> Result<(), String> {
    let threshold = effect.threshold.unwrap_or(0.2);
    let thickness = effect.thickness.unwrap_or(1.0);
    let color = effect.color.unwrap_or(0x000000ff);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.outline", OUTLINE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_threshold", threshold);
        uniform_1f(gl, p, "u_thickness", thickness);
        uniform_4f(
            gl,
            p,
            "u_color",
            ((color >> 24) & 0xff) as f32 / 255.0,
            ((color >> 16) & 0xff) as f32 / 255.0,
            ((color >> 8) & 0xff) as f32 / 255.0,
            (color & 0xff) as f32 / 255.0,
        );
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_outline_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<OutlineEffect>() else {
        return Ok(());
    };
    return apply_outline_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_outline_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "OutlineEffect", gl_outline_effect_runner, None);
}
