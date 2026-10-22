// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Directional blur: accumulates samples stepped along `angle` (degrees) over `length` texels, normalized by the sample count; `u_resolution` converts the texel length into UV space. (TS `wgpuDirectionalBlurEffect.ts`).

use flight_effects::{DirectionalBlurEffect, Effect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const DIRECTIONAL_BLUR_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_angle : f32,
  u_length : f32,
  u_samples : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let dir = vec2f(cos(uni.u_angle), sin(uni.u_angle)) * (uni.u_length / uni.u_resolution);
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, (f32(i) / (count - 1.0)) - 0.5, count > 1.0);
    let p = uv + dir * t;
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}"#;

/// Applies a `DirectionalBlurEffect` to `source`, writing `dest` (TS `applyDirectionalBlurEffectToWgpu`).
pub fn apply_directional_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &DirectionalBlurEffect,
) {
    let angle = (effect.angle.unwrap_or(0.0) * std::f32::consts::PI) / 180.0;
    let length = effect.length.unwrap_or(8.0);
    let samples = effect.samples.unwrap_or(16.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "motion.directionalBlur",
        DIRECTIONAL_BLUR_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = angle;
            f32[1] = length;
            f32[2] = samples;
            f32[4] = resolution.width;
            f32[5] = resolution.height;
        },
    );
}

/// Registers the default runner under `DirectionalBlurEffect` (TS `registerWgpuDirectionalBlurEffect`).
pub fn register_wgpu_directional_blur_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "DirectionalBlurEffect",
        wgpu_directional_blur_effect_runner,
        None,
    );
}

/// The default `DirectionalBlurEffect` runner (TS `wgpuDirectionalBlurEffectRunner`).
pub fn wgpu_directional_blur_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect =
        downcast_wgpu_effect::<DirectionalBlurEffect>(effect, "wgpuDirectionalBlurEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_directional_blur_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
