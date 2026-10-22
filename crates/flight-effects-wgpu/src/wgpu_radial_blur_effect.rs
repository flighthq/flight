// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Radial blur (TS `wgpuRadialBlurEffect.ts`): samples stepped from each uv toward the center,
//! scaled by `strength` and normalized by the sample count. The WebGPU mirror of effects-gl's radial
//! blur.

use flight_effects::{Effect, RadialBlurEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

// Slot layout: [0]=center.x, [1]=center.y, [2]=strength, [3]=samples.
const RADIAL_BLUR_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_center : vec2f,
  u_strength : f32,
  u_samples : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = 16;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let toCenter = uni.u_center - uv;
  let count = min(uni.u_samples, 16.0);
  var sum = vec4f(0.0);
  var taken = 0.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    if (f32(i) >= count) { break; }
    let t = select(0.0, f32(i) / (count - 1.0), count > 1.0);
    let p = uv + toCenter * (t * uni.u_strength);
    sum = sum + textureSampleLevel(tex, smp, p, 0.0);
    taken = taken + 1.0;
  }
  return sum / max(taken, 1.0);
}"#;

/// Accumulates samples stepped toward (`center_x`, `center_y`) (TS
/// `applyRadialBlurEffectToWgpu`). `center_y` is screen space with a top-left origin, and the
/// effect pass's fullscreen uv is already top-left, so it passes through UNCONVERTED (the GL
/// runner flips because its quad is bottom-left).
pub fn apply_radial_blur_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &RadialBlurEffect,
) {
    let center_x = effect.center_x.unwrap_or(0.5);
    let center_y = effect.center_y.unwrap_or(0.5);
    let strength = effect.strength.unwrap_or(0.2);
    let samples = effect.samples.unwrap_or(16.0);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "motion.radialBlur",
        RADIAL_BLUR_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = center_x;
            f32[1] = center_y;
            f32[2] = strength;
            f32[3] = samples;
        },
    );
}

/// Registers the default runner under `RadialBlurEffect` (TS `registerWgpuRadialBlurEffect`).
pub fn register_wgpu_radial_blur_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "RadialBlurEffect",
        wgpu_radial_blur_effect_runner,
        None,
    );
}

/// The default `RadialBlurEffect` runner (TS `wgpuRadialBlurEffectRunner`).
pub fn wgpu_radial_blur_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<RadialBlurEffect>(effect, "wgpuRadialBlurEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_radial_blur_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
