// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! God rays: radial light scattering from a screen-space light position (centerX, centerY). Marches
//! SAMPLES steps along the ray from each fragment toward the light, accumulating color with per-step
//! decay and weight, then scales by exposure. A true single-pass recipe — no depth needed.

use flight_effects::{Effect, GodRaysEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const GOD_RAYS_FRAGMENT_HEAD: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_lightPosition;
uniform float u_density;
uniform float u_decay;
uniform float u_weight;
uniform float u_exposure;
out vec4 o_color;
const float SAMPLES = "#;

const GOD_RAYS_FRAGMENT_TAIL: &str = r#";
void main() {
  vec2 delta = (v_texCoord - u_lightPosition) * (u_density / SAMPLES);
  vec2 coord = v_texCoord;
  vec4 base = texture(u_texture0, v_texCoord);
  vec3 accum = base.rgb;
  float illumination = 1.0;
  for (int i = 0; i < int(SAMPLES); i++) {
    coord -= delta;
    vec3 s = texture(u_texture0, coord).rgb;
    s *= illumination * u_weight;
    accum += s;
    illumination *= u_decay;
  }
  o_color = vec4(base.rgb + accum * u_exposure, base.a);
}"#;

pub fn apply_god_rays_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &GodRaysEffect,
) -> Result<(), String> {
    let center_x = effect.center_x.unwrap_or(0.5);
    // `center_y` is top-left origin on GodRaysEffect; the fullscreen texcoords are bottom-left, so
    // the contract value is flipped into this backend's texture space at the seam.
    let center_y = 1.0 - effect.center_y.unwrap_or(0.5);
    let density = effect.density.unwrap_or(0.96);
    let decay = effect.decay.unwrap_or(0.93);
    let weight = effect.weight.unwrap_or(0.4);
    let exposure = effect.exposure.unwrap_or(0.6);
    // JS `Math.round` (halves toward +infinity), floored at one sample.
    let samples = (effect.samples.unwrap_or(64.0) + 0.5).floor().max(1.0) as u32;
    let program = get_gl_effect_program(
        state,
        &format!("atmospheric.godRays.{samples}"),
        &build_god_rays_fragment(samples),
    )?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_2f(gl, p, "u_lightPosition", center_x, center_y);
        uniform_1f(gl, p, "u_density", density);
        uniform_1f(gl, p, "u_decay", decay);
        uniform_1f(gl, p, "u_weight", weight);
        uniform_1f(gl, p, "u_exposure", exposure);
    });
}

/// TS `samples.toFixed(1)` spliced between the shader head and tail.
fn build_god_rays_fragment(samples: u32) -> String {
    return format!("{GOD_RAYS_FRAGMENT_HEAD}{samples}.0{GOD_RAYS_FRAGMENT_TAIL}");
}

pub fn gl_god_rays_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<GodRaysEffect>() else {
        return Ok(());
    };
    return apply_god_rays_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_god_rays_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "GodRaysEffect", gl_god_rays_effect_runner, None);
}
