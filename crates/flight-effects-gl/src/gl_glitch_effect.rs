// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Glitch: split the frame into horizontal blocks, displace each by a per-block hash (data-mosh
//! tear), separate the RGB channels, and corrupt the occasional block to white. `seed` animates it.

use flight_effects::{Effect, GlitchEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const GLITCH_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_blockSize;
uniform float u_colorShift;
uniform float u_seed;
uniform vec2 u_resolution;
out vec4 o_color;
float ghash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  float blockSize = max(2.0, u_blockSize);
  // Blocks are numbered down the image, so the tear and corruption of a given band land where the
  // author placed them. A render target is bottom-left origin, so the image-space row is measured
  // from the far edge; numbering straight from v_texCoord.y would run the bands the other way up.
  // Only the block INDEX converts — sampling below stays in the target's own coordinates.
  float block = floor((1.0 - v_texCoord.y) * u_resolution.y / blockSize);
  float r = ghash(block + u_seed * 7.0);
  float tear = step(1.0 - u_intensity * 0.6, r);
  float shiftPx = (ghash(block * 1.7 + u_seed) - 0.5) * 2.0 * tear * u_intensity * 40.0;
  vec2 baseUv = vec2(v_texCoord.x + shiftPx / u_resolution.x, v_texCoord.y);
  float cs = (u_colorShift * (0.4 + tear)) / u_resolution.x;
  float rC = texture(u_texture0, vec2(baseUv.x + cs, baseUv.y)).r;
  float gC = texture(u_texture0, baseUv).g;
  float bC = texture(u_texture0, vec2(baseUv.x - cs, baseUv.y)).b;
  float a = texture(u_texture0, baseUv).a;
  vec3 col = vec3(rC, gC, bC);
  float corrupt = step(0.985 - u_intensity * 0.04, ghash(block * 3.3 + u_seed * 2.0));
  col = mix(col, vec3(1.0), corrupt * 0.6);
  o_color = vec4(col, a);
}"#;

pub fn apply_glitch_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &GlitchEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(0.5);
    let block_size = effect.block_size.unwrap_or(24.0);
    let color_shift = effect.color_shift.unwrap_or(8.0);
    let seed = effect.seed.unwrap_or(0.0);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.glitch", GLITCH_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_intensity", intensity);
        uniform_1f(gl, p, "u_blockSize", block_size);
        uniform_1f(gl, p, "u_colorShift", color_shift);
        uniform_1f(gl, p, "u_seed", seed);
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_glitch_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<GlitchEffect>() else {
        return Ok(());
    };
    return apply_glitch_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_glitch_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "GlitchEffect", gl_glitch_effect_runner, None);
}
