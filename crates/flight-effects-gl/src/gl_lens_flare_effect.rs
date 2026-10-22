// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Lens flare: a single-pass approximation. On each fragment, sample the source's bright spots
//! along the vector from the pixel toward the center, adding `ghosts` evenly spaced ghost samples
//! plus a halo ring, scaled by threshold/intensity.

use flight_effects::{Effect, LensFlareEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const LENS_FLARE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
uniform float u_intensity;
uniform float u_ghosts;
uniform float u_halo;
out vec4 o_color;
vec3 brightPass(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  vec3 c = texture(u_texture0, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c * max(0.0, l - u_threshold);
}
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  // Single-pass approximation of a flare: walk ghost samples along the vector toward the optical
  // center and add a halo ring, all from the bright pass of the scene itself (no separate buffer).
  vec2 toCenter = (vec2(0.5) - v_texCoord);
  vec3 flare = vec3(0.0);
  int count = int(clamp(u_ghosts, 0.0, 8.0));
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    float t = (float(i) + 1.0) / (float(count) + 1.0);
    vec2 uv = v_texCoord + toCenter * (2.0 * t);
    flare += brightPass(uv);
  }
  // Negate epsilon Y: GL UV Y-up vs WGPU UV Y-down. The epsilon is a divide-by-zero guard for
  // normalize(); its Y must match the screen-space convention to avoid a direction flip at center.
  vec2 haloDir = normalize(toCenter + vec2(1e-5, -1e-5));
  flare += brightPass(v_texCoord + haloDir * u_halo) * u_halo;
  o_color = vec4(scene.rgb + flare * u_intensity, scene.a);
}"#;

pub fn apply_lens_flare_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &LensFlareEffect,
) -> Result<(), String> {
    let threshold = effect.threshold.unwrap_or(0.8);
    let intensity = effect.intensity.unwrap_or(1.0);
    let ghosts = effect.ghosts.unwrap_or(4.0);
    let halo = effect.halo.unwrap_or(0.5);
    let program = get_gl_effect_program(state, "lens.lensFlare", LENS_FLARE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_threshold", threshold);
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_ghosts", ghosts);
        uniform_1f(gl, p, "u_halo", halo);
    });
}

pub fn gl_lens_flare_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<LensFlareEffect>() else {
        return Ok(());
    };
    return apply_lens_flare_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_lens_flare_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "LensFlareEffect", gl_lens_flare_effect_runner, None);
}
