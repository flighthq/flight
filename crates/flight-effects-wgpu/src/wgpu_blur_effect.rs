// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Plain separable Gaussian blur (TS `wgpuBlurEffect.ts`): two axis passes (source → temp
//! horizontally, temp → dest vertically), each one weighted fullscreen pass with radius ⌈3σ⌉.
//! `blur_x` / `blur_y` are Gaussian standard deviations (CSS `blur(Xpx)` uses sigma = X), matching
//! the CSS and surface references and the effects-gl blur. The shared Gaussian primitive bloom and
//! the plain blur both use.

use flight_effects::{BlurEffect, Effect};
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget, WgpuTextureRenderTargetDescriptor,
    acquire_wgpu_texture_render_target, release_wgpu_texture_render_target,
};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::{
    get_wgpu_effect_logical_width, get_wgpu_render_target_texel_scale,
};

// Slot layout: [0,1]=texelSize, [2,3]=direction, [4]=radius, [5]=sigma.
const GAUSSIAN_BLUR_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  direction : vec2f,
  radius : f32,
  sigma : f32,
  _pad0 : f32, _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = i32(uni.radius);
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  let twoSigmaSq = 2.0 * uni.sigma * uni.sigma;
  var sum = vec4f(0.0);
  var weightSum = 0.0;
  for (var i = -r; i <= r; i++) {
    let w = exp(-f32(i * i) / twoSigmaSq);
    sum += w * textureSampleLevel(tex, smp, uv + f32(i) * uni.texelSize * uni.direction, 0.0);
    weightSum += w;
  }
  return sum / weightSum;
}"#;

/// Applies a `BlurEffect` to `source`, writing `dest` (TS `applyBlurEffectToWgpu`). `temp` is a
/// ping-pong scratch target distinct from both `source` and `dest`.
pub fn apply_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    temp: &WgpuTextureRenderTarget,
    effect: &BlurEffect,
) {
    apply_gaussian_blur_to_wgpu(
        state,
        source,
        dest,
        temp,
        &WgpuGaussianBlurOptions {
            blur_x: effect.blur_x,
            blur_y: effect.blur_y,
        },
    );
}

/// The separable Gaussian blur primitive (TS `applyGaussianBlurToWgpu`). Sigma is in logical
/// pixels while the pass steps in texels, so sigma is scaled by the target's texel density against
/// the logical width (a supersampled target holds two texels per logical pixel). `blur_x` /
/// `blur_y` default to 4.
pub fn apply_gaussian_blur_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    temp: &WgpuTextureRenderTarget,
    options: &WgpuGaussianBlurOptions,
) {
    let scale = get_wgpu_render_target_texel_scale(
        source.width as f32,
        get_wgpu_effect_logical_width(state, source),
    );
    let sigma_x = options.blur_x.unwrap_or(4.0) * scale;
    let sigma_y = options.blur_y.unwrap_or(4.0) * scale;
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
    apply_wgpu_gaussian_blur_pass(state, source, temp, sigma_x, radius_x, 1.0, 0.0);
    apply_wgpu_gaussian_blur_pass(state, temp, dest, sigma_y, radius_y, 0.0, 1.0);
}

fn apply_wgpu_gaussian_blur_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    sigma: f32,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
) {
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "blur.gaussian",
        GAUSSIAN_BLUR_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    let width = source.width as f32;
    let height = source.height as f32;
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = 1.0 / width;
            f32[1] = 1.0 / height;
            f32[2] = dir_x;
            f32[3] = dir_y;
            f32[4] = radius;
            f32[5] = sigma;
        },
    );
}

/// Registers the default runner under `BlurEffect` (TS `registerWgpuBlurEffect`).
pub fn register_wgpu_blur_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "BlurEffect", wgpu_blur_effect_runner, None);
}

/// The default `BlurEffect` runner (TS `wgpuBlurEffectRunner`): borrows one scratch target from
/// the pool for the horizontal pass.
pub fn wgpu_blur_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<BlurEffect>(effect, "wgpuBlurEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    let descriptor = WgpuTextureRenderTargetDescriptor {
        color_space: None,
        format: Some(source.format),
        height: source.height as f32,
        sample_count: None,
        width: source.width as f32,
    };
    let temp = acquire_wgpu_texture_render_target(ctx.state, ctx.pool, &descriptor);
    apply_blur_effect_to_wgpu(ctx.state, &source, &dest, &temp.read().unwrap(), effect);
    release_wgpu_texture_render_target(ctx.pool, temp);
}
