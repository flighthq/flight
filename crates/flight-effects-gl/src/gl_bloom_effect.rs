// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Bloom: bright-pass → blur the bright branch (via the effects-owned separable gaussian blur) →
//! additively composite back. The multi-pass reference recipe — it acquires intermediate targets
//! from the pool and releases them, branches, and reuses the blur primitive.

use flight_effects::{
    BloomEffect, Effect, compute_bloom_blur_radius, compute_bloom_intensity,
    compute_bloom_threshold,
};
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, draw_gl_fullscreen_pass,
    release_gl_texture_render_target,
};

use crate::contract::{
    GlEffectContext, GlGaussianBlurOptions, apply_gaussian_blur_to_gl, get_gl_effect_program,
    register_gl_effect,
};
use crate::gl_effect_support::{acquire_gl_effect_target, uniform_1f};

const BLOOM_BRIGHT_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = step(u_threshold, l);
  o_color = vec4(c.rgb * k, c.a);
}"#;

const BLOOM_COMPOSITE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  vec4 bloom = texture(u_texture1, v_texCoord);
  o_color = vec4(scene.rgb + bloom.rgb * u_intensity, scene.a);
}"#;

pub fn apply_bloom_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &BloomEffect,
) -> Result<(), String> {
    let threshold = compute_bloom_threshold(effect);
    let intensity = compute_bloom_intensity(effect);
    let radius = compute_bloom_blur_radius(effect);

    let bright = acquire_gl_effect_target(state, pool, source)?;
    let blurred = acquire_gl_effect_target(state, pool, source)?;
    let temp = acquire_gl_effect_target(state, pool, source)?;

    let result = (|| -> Result<(), String> {
        let bright_program =
            get_gl_effect_program(state, "bloom.bright", BLOOM_BRIGHT_FRAGMENT_SRC)?;
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
                blur_x: Some(radius),
                blur_y: Some(radius),
            },
        )?;

        let composite_program =
            get_gl_effect_program(state, "bloom.composite", BLOOM_COMPOSITE_FRAGMENT_SRC)?;
        return draw_gl_fullscreen_pass(
            state,
            &composite_program,
            &[source.texture, blurred.texture],
            Some(dest),
            |gl, p| {
                uniform_1f(gl, p, "u_intensity", intensity);
            },
        );
    })();

    release_gl_texture_render_target(pool, bright);
    release_gl_texture_render_target(pool, blurred);
    release_gl_texture_render_target(pool, temp);
    return result;
}

pub fn gl_bloom_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<BloomEffect>() else {
        return Ok(());
    };
    return apply_bloom_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_bloom_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "BloomEffect", gl_bloom_effect_runner, None);
}
