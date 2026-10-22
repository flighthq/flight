// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Tilt-shift: keep a horizontal focus band sharp and blur above and below it. The band is centered
//! at `center` on Y with height `width`; blur strength ramps with distance outside the band.

use flight_effects::{Effect, TiltShiftEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const TILT_SHIFT_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_center;
uniform float u_width;
uniform float u_blur;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  // The focus band sits at u_center measured DOWN the image, so the row is taken from the far edge on
  // a bottom-left-origin target. At a centred band the two are indistinguishable — abs is symmetric
  // about 0.5 — which is why an off-centre band is the only way to see this go wrong.
  float dist = abs((1.0 - v_texCoord.y) - u_center);
  float edge = u_width * 0.5;
  float amount = smoothstep(edge, edge + u_width, dist);
  float radius = amount * u_blur;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 offset = vec2(0.0, float(i)) * radius * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}"#;

pub fn apply_tilt_shift_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &TiltShiftEffect,
) -> Result<(), String> {
    let center = effect.center.unwrap_or(0.5);
    let width = effect.width.unwrap_or(0.3);
    let blur = effect.blur.unwrap_or(4.0);
    let resolution_x = source.axes.width as f32;
    let resolution_y = source.axes.height as f32;
    let program = get_gl_effect_program(state, "lens.tiltShift", TILT_SHIFT_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_center", center);
        uniform_1f(gl, p, "u_width", width);
        uniform_1f(gl, p, "u_blur", blur);
        uniform_2f(gl, p, "u_resolution", resolution_x, resolution_y);
    });
}

pub fn gl_tilt_shift_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<TiltShiftEffect>() else {
        return Ok(());
    };
    return apply_tilt_shift_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_tilt_shift_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "TiltShiftEffect", gl_tilt_shift_effect_runner, None);
}
