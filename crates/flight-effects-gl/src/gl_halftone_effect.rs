// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Halftone: sample luminance, then carve a rotated dot grid whose dot radius tracks darkness — the
//! classic print/comic screen. `scale` sets the cell size, `angle` rotates the grid.

use flight_effects::{Effect, HalftoneEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const HALFTONE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_scale;
uniform float u_angle;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec2 p = v_texCoord * u_resolution;
  float s = sin(u_angle), co = cos(u_angle);
  vec2 rp = vec2(p.x * co - p.y * s, p.x * s + p.y * co);
  vec2 cell = mod(rp, u_scale) - u_scale * 0.5;
  float dist = length(cell) / (u_scale * 0.5);
  float radius = sqrt(1.0 - lum);
  float dot1 = step(dist, radius);
  o_color = vec4(c.rgb * dot1, c.a);
}"#;

pub fn apply_halftone_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &HalftoneEffect,
) -> Result<(), String> {
    let scale = effect.scale.unwrap_or(6.0);
    let angle = (effect.angle.unwrap_or(22.92) * std::f32::consts::PI) / 180.0;
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.halftone", HALFTONE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_scale", scale.max(1.0));
        uniform_1f(gl, p, "u_angle", angle);
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_halftone_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<HalftoneEffect>() else {
        return Ok(());
    };
    return apply_halftone_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_halftone_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "HalftoneEffect", gl_halftone_effect_runner, None);
}
