// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Radial blur: accumulate samples stepped from the current uv toward (centerX, centerY) scaled by
//! `strength`, normalized by the sample count. Single-pass reference recipe.

use flight_effects::{Effect, RadialBlurEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const RADIAL_BLUR_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_center;
uniform float u_strength;
uniform float u_samples;
out vec4 o_color;
const int SAMPLES = 16;
void main() {
  vec2 toCenter = u_center - v_texCoord;
  float count = min(u_samples, 16.0);
  vec4 sum = vec4(0.0);
  float taken = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    if (float(i) >= count) break;
    float t = count > 1.0 ? float(i) / (count - 1.0) : 0.0;
    vec2 uv = v_texCoord + toCenter * (t * u_strength);
    sum += texture(u_texture0, uv);
    taken += 1.0;
  }
  o_color = sum / max(taken, 1.0);
}"#;

pub fn apply_radial_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &RadialBlurEffect,
) -> Result<(), String> {
    let center_x = effect.center_x.unwrap_or(0.5);
    // `center_y` is screen space (top-left origin); the fullscreen quad's texcoords are
    // bottom-left origin, so the descriptor value is converted at this runner's seam.
    let center_y = 1.0 - effect.center_y.unwrap_or(0.5);
    let strength = effect.strength.unwrap_or(0.2);
    let samples = effect.samples.unwrap_or(16.0);
    let program = get_gl_effect_program(state, "radialBlur", RADIAL_BLUR_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_2f(gl, p, "u_center", center_x, center_y);
        uniform_1f(gl, p, "u_strength", strength);
        uniform_1f(gl, p, "u_samples", samples);
    });
}

pub fn gl_radial_blur_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<RadialBlurEffect>() else {
        return Ok(());
    };
    return apply_radial_blur_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_radial_blur_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "RadialBlurEffect",
        gl_radial_blur_effect_runner,
        None,
    );
}
