// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, borrow render-gl render-texture entries and return Result diagnostics
//! Plain separable Gaussian blur: two axis passes (source → temp horizontally, temp → dest
//! vertically), each a single weighted fullscreen pass with radius ⌈3σ⌉. `blur_x`/`blur_y` are the
//! Gaussian standard deviations (CSS `blur(Xpx)` uses sigma = X). The effects-owned blur primitive —
//! the shared gaussian pass BloomEffect and the plain BlurEffect both use.

use flight_effects::{BlurEffect, Effect};
use flight_render::RenderTexture;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass, get_gl_render_texture_target,
    release_gl_texture_render_target, with_gl_render_state, write_gl_render_texture_target,
};

use crate::contract::{
    GlEffectContext, GlGaussianBlurOptions, get_gl_effect_program, get_gl_effect_uniform_location,
    register_gl_effect,
};
use crate::gl_effect_support::{acquire_gl_effect_target, set_uniform_1f, set_uniform_2f};
use crate::gl_render_texture_effect::assert_distinct_render_textures;

const GAUSSIAN_BLUR_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_texelSize;
uniform float u_sigma;
uniform float u_radius;
uniform vec2 u_direction;
out vec4 o_color;
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    o_color = texture(u_texture0, v_texCoord);
    return;
  }
  float twoSigmaSq = 2.0 * u_sigma * u_sigma;
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  for (int i = -r; i <= r; i++) {
    float w = exp(-float(i * i) / twoSigmaSq);
    sum += w * texture(u_texture0, v_texCoord + float(i) * u_texelSize * u_direction);
    weightSum += w;
  }
  o_color = sum / weightSum;
}"#;

/// Applies a `BlurEffect` descriptor to `source`, compositing into `dest`. Neither `dest` nor the
/// distinct ping-pong `temp` target is cleared by this entry point.
pub fn apply_blur_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    temp: &GlTextureRenderTarget,
    effect: &BlurEffect,
) -> Result<(), String> {
    return apply_gaussian_blur_to_gl(
        state,
        source,
        dest,
        temp,
        &GlGaussianBlurOptions {
            blur_x: effect.blur_x,
            blur_y: effect.blur_y,
        },
    );
}

/// RenderTexture-facing BlurEffect apply. It composites and never clears; clear reused `dest` and
/// `temp` first with `clear_gl_render_texture` when each frame should replace the previous result.
// flight-lint: allow(conform-params) D17 the native application returns render-gl's Result diagnostics
pub fn apply_blur_effect_to_gl_render_textures(
    state: &mut GlRenderState,
    source: &RenderTexture,
    dest: &mut RenderTexture,
    temp: &mut RenderTexture,
    effect: &BlurEffect,
) -> Result<bool, String> {
    return apply_gaussian_blur_to_gl_render_textures(
        state,
        source,
        dest,
        temp,
        &GlGaussianBlurOptions {
            blur_x: effect.blur_x,
            blur_y: effect.blur_y,
        },
    );
}

/// Applies a faithful separable Gaussian blur to `source`, compositing into `dest`. `blur_x` /
/// `blur_y` are the Gaussian standard deviations in pixels (default 4). Runs two unconditional
/// separable passes, source → temp (X) then temp → dest (Y); neither destination is cleared.
pub fn apply_gaussian_blur_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    temp: &GlTextureRenderTarget,
    options: &GlGaussianBlurOptions,
) -> Result<(), String> {
    let sigma_x = options.blur_x.unwrap_or(4.0);
    let sigma_y = options.blur_y.unwrap_or(4.0);
    let radius_x = if sigma_x > 0.0 {
        (sigma_x * 3.0).ceil()
    } else {
        0.0
    };
    let radius_y = if sigma_y > 0.0 {
        (sigma_y * 3.0).ceil()
    } else {
        0.0
    };
    apply_gl_gaussian_blur_pass(state, source, temp, sigma_x, radius_x, 1.0, 0.0)?;
    return apply_gl_gaussian_blur_pass(state, temp, dest, sigma_y, radius_y, 0.0, 1.0);
}

/// RenderTexture-facing target-to-target apply. Both passes composite and never clear; callers
/// reusing `dest` or `temp` across frames must first clear them with `clear_gl_render_texture`.
/// Returns `false` when the source has no realized GL target.
// flight-lint: allow(conform-params) D17 the native application returns render-gl's Result diagnostics
pub fn apply_gaussian_blur_to_gl_render_textures(
    state: &mut GlRenderState,
    source: &RenderTexture,
    dest: &mut RenderTexture,
    temp: &mut RenderTexture,
    options: &GlGaussianBlurOptions,
) -> Result<bool, String> {
    assert_distinct_render_textures(
        source,
        dest,
        temp,
        "applyGaussianBlurToGlRenderTextures: source, destination, and scratch must be distinct",
    );
    let Some(source_entry) = get_gl_render_texture_target(state, source) else {
        return Ok(false);
    };
    with_gl_render_state(state, |state| {
        return write_gl_render_texture_target(state, temp, |state, temp_target| {
            return write_gl_render_texture_target(state, dest, |state, dest_target| {
                let source_borrow = source_entry.borrow();
                return apply_gaussian_blur_to_gl(
                    state,
                    &source_borrow.target,
                    dest_target,
                    temp_target,
                    options,
                );
            });
        });
    })?;
    return Ok(true);
}

fn apply_gl_gaussian_blur_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    sigma: f32,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
) -> Result<(), String> {
    let program = get_gl_effect_program(state, "blur.gaussian", GAUSSIAN_BLUR_FRAGMENT_SRC)?;
    let loc_texel_size = get_gl_effect_uniform_location(state, &program, "u_texelSize");
    let loc_sigma = get_gl_effect_uniform_location(state, &program, "u_sigma");
    let loc_radius = get_gl_effect_uniform_location(state, &program, "u_radius");
    let loc_direction = get_gl_effect_uniform_location(state, &program, "u_direction");
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, _p| {
        set_uniform_2f(gl, loc_texel_size.as_ref(), 1.0 / width, 1.0 / height);
        set_uniform_1f(gl, loc_sigma.as_ref(), sigma);
        set_uniform_1f(gl, loc_radius.as_ref(), radius);
        set_uniform_2f(gl, loc_direction.as_ref(), dir_x, dir_y);
    });
}

pub fn gl_blur_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<BlurEffect>() else {
        return Ok(());
    };
    let temp = acquire_gl_effect_target(ctx.state, ctx.pool, ctx.source)?;
    let result = apply_blur_effect_to_gl(ctx.state, ctx.source, ctx.dest, &temp, effect);
    release_gl_texture_render_target(ctx.pool, temp);
    return result;
}

pub fn register_gl_blur_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "BlurEffect", gl_blur_effect_runner, None);
}
