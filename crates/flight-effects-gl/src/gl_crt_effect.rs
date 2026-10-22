// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! CRT: barrel-distort the uv (curvature), darken alternating scanlines, vignette the edges, and
//! split the channels outward (chromatic aberration) for a tube-monitor look.

use flight_effects::{CrtEffect, Effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const CRT_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_vignette;
uniform float u_aberration;
uniform vec2 u_resolution;
out vec4 o_color;
vec2 barrel(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c += c * u_curvature * dot(c, c);
  return c * 0.5 + 0.5;
}
void main() {
  vec2 uv = barrel(v_texCoord);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 off = vec2(u_aberration, 0.0);
  float r = texture(u_texture0, uv + off).r;
  float g = texture(u_texture0, uv).g;
  float b = texture(u_texture0, uv - off).b;
  float a = texture(u_texture0, uv).a;
  vec3 col = vec3(r, g, b);
  // Scanlines are counted DOWN the image so a given line falls on the same row on either backend; a
  // render target is bottom-left, so the row is measured from the far edge first.
  float line = sin((1.0 - uv.y) * u_resolution.y * 3.14159265) * 0.5 + 0.5;
  col *= 1.0 - u_scanlineIntensity * (1.0 - line);
  vec2 vc = uv * 2.0 - 1.0;
  col *= 1.0 - u_vignette * dot(vc, vc);
  o_color = vec4(col, a);
}"#;

pub fn apply_crt_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &CrtEffect,
) -> Result<(), String> {
    let curvature = effect.curvature.unwrap_or(0.1);
    let scanline_intensity = effect.scanline_intensity.unwrap_or(0.3);
    let vignette = effect.vignette.unwrap_or(0.3);
    let aberration = effect.aberration.unwrap_or(0.005);
    let resolution_x = source.axes.width as f32;
    let resolution_y = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.crt", CRT_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_curvature", curvature);
        uniform_1f(gl, p, "u_scanlineIntensity", scanline_intensity);
        uniform_1f(gl, p, "u_vignette", vignette);
        uniform_1f(gl, p, "u_aberration", aberration);
        uniform_2f(gl, p, "u_resolution", resolution_x, resolution_y);
    });
}

pub fn gl_crt_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<CrtEffect>() else {
        return Ok(());
    };
    return apply_crt_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_crt_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "CrtEffect", gl_crt_effect_runner, None);
}
