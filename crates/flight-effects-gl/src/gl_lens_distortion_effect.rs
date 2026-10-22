// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Lens distortion: remap uv by a radial polynomial. Positive amount bulges outward (barrel), negative
//! pinches inward (pincushion); scale re-frames the result so corners stay in view.

use flight_effects::{Effect, LensDistortionEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const LENS_DISTORTION_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform float u_scale;
out vec4 o_color;
void main() {
  vec2 centered = (v_texCoord - 0.5) / u_scale;
  float r2 = dot(centered, centered);
  vec2 distorted = centered * (1.0 + u_amount * r2) + 0.5;
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    o_color = texture(u_texture0, distorted);
  }
}"#;

pub fn apply_lens_distortion_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &LensDistortionEffect,
) -> Result<(), String> {
    let amount = effect.amount.unwrap_or(0.2);
    let scale = effect.scale.unwrap_or(1.0);
    let program =
        get_gl_effect_program(state, "lens.lensDistortion", LENS_DISTORTION_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_amount", amount);
        uniform_1f(gl, p, "u_scale", scale);
    });
}

pub fn gl_lens_distortion_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<LensDistortionEffect>() else {
        return Ok(());
    };
    return apply_lens_distortion_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_lens_distortion_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "LensDistortionEffect",
        gl_lens_distortion_effect_runner,
        None,
    );
}
