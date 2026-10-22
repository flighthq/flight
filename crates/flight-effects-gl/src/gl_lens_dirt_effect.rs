// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Lens dirt: isolate bright energy, spread it spatially, then admit it through a procedural smudge
//! mask. The bright branch must blur before the mask: masking only the source pixel cannot carry any
//! energy into the dark background, reducing this spatial effect to a pointwise highlight boost.

use flight_effects::{Effect, LensDirtEffect};
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, draw_gl_fullscreen_pass,
    release_gl_texture_render_target,
};

use crate::contract::{
    GlEffectContext, GlGaussianBlurOptions, apply_gaussian_blur_to_gl, get_gl_effect_program,
    register_gl_effect,
};
use crate::gl_effect_support::{acquire_gl_effect_target, uniform_1f};

const LENS_DIRT_BLUR_SIGMA: f32 = 8.0;

const LENS_DIRT_BRIGHT_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float bright = max(0.0, lum - u_threshold);
  o_color = vec4(c.rgb * (bright / max(lum, 0.00001)), c.a);
}"#;

const LENS_DIRT_COMPOSITE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_intensity;
uniform float u_seed;
out vec4 o_color;
float dirtHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float dirtAmount(vec2 uv, float seed) {
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 c = vec2(dirtHash(vec2(fi, seed)), dirtHash(vec2(fi + 9.0, seed)));
    float r = 0.06 + 0.16 * dirtHash(vec2(fi + 3.0, seed));
    float d = distance(uv, c) / r;
    acc += smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  vec3 bright = texture(u_texture1, v_texCoord).rgb;
  float dirt = dirtAmount(v_texCoord, u_seed + 1.0);
  o_color = vec4(scene.rgb + bright * dirt * u_intensity * 2.0, scene.a);
}"#;

pub fn apply_lens_dirt_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &LensDirtEffect,
) -> Result<(), String> {
    let intensity = effect.intensity.unwrap_or(1.0);
    let threshold = effect.threshold.unwrap_or(0.55);
    let seed = effect.seed.unwrap_or(0.0);
    let bright = acquire_gl_effect_target(state, pool, source)?;
    let blurred = acquire_gl_effect_target(state, pool, source)?;
    let temp = acquire_gl_effect_target(state, pool, source)?;

    let result = (|| -> Result<(), String> {
        let bright_program =
            get_gl_effect_program(state, "lens.lensDirt.bright", LENS_DIRT_BRIGHT_FRAGMENT_SRC)?;
        draw_gl_fullscreen_pass(
            state,
            &bright_program,
            &[source.texture],
            Some(&bright),
            |gl, p| {
                uniform_1f(gl, p, "u_threshold", threshold);
            },
        )?;

        apply_gaussian_blur_to_gl(
            state,
            &bright,
            &blurred,
            &temp,
            &GlGaussianBlurOptions {
                blur_x: Some(LENS_DIRT_BLUR_SIGMA),
                blur_y: Some(LENS_DIRT_BLUR_SIGMA),
            },
        )?;

        let composite_program = get_gl_effect_program(
            state,
            "lens.lensDirt.composite",
            LENS_DIRT_COMPOSITE_FRAGMENT_SRC,
        )?;
        return draw_gl_fullscreen_pass(
            state,
            &composite_program,
            &[source.texture, blurred.texture],
            Some(dest),
            |gl, p| {
                uniform_1f(gl, p, "u_intensity", intensity);
                uniform_1f(gl, p, "u_seed", seed);
            },
        );
    })();

    release_gl_texture_render_target(pool, bright);
    release_gl_texture_render_target(pool, blurred);
    release_gl_texture_render_target(pool, temp);
    return result;
}

pub fn gl_lens_dirt_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<LensDirtEffect>() else {
        return Ok(());
    };
    return apply_lens_dirt_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_lens_dirt_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "LensDirtEffect", gl_lens_dirt_effect_runner, None);
}
