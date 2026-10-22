// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Lens distortion: remaps uv by a radial polynomial; positive amount bulges outward (barrel), negative pinches inward (pincushion); scale re-frames the result. (TS `wgpuLensDistortionEffect.ts`).

use flight_effects::{Effect, LensDistortionEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const LENS_DISTORTION_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_amount : f32,
  u_scale : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let centered = (uv - vec2f(0.5)) / uni.u_scale;
  let r2 = dot(centered, centered);
  let distorted = centered * (1.0 + uni.u_amount * r2) + vec2f(0.5);
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  return textureSampleLevel(tex, smp, distorted, 0.0);
}"#;

/// Applies a `LensDistortionEffect` to `source`, writing `dest` (TS `applyLensDistortionEffectToWgpu`).
pub fn apply_lens_distortion_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &LensDistortionEffect,
) {
    let amount = effect.amount.unwrap_or(0.2);
    let scale = effect.scale.unwrap_or(1.0);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "lens.lensDistortion",
        LENS_DISTORTION_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = amount;
            f32[1] = scale;
        },
    );
}

/// Registers the default runner under `LensDistortionEffect` (TS `registerWgpuLensDistortionEffect`).
pub fn register_wgpu_lens_distortion_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "LensDistortionEffect", wgpu_lens_distortion_effect_runner, None);
}

/// The default `LensDistortionEffect` runner (TS `wgpuLensDistortionEffectRunner`).
pub fn wgpu_lens_distortion_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<LensDistortionEffect>(effect, "wgpuLensDistortionEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_lens_distortion_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
