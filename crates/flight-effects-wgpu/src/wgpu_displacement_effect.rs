// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Displacement / heat-haze: warps the sample uv by an animated sine field for a refractive wobble. (TS `wgpuDisplacementEffect.ts`).

use flight_effects::{DisplacementEffect, Effect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const DISPLACEMENT_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_intensity : f32,
  u_frequency : f32,
  u_seed : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let f = uni.u_frequency;
  let warp = vec2f(
    sin(uv.y * f + uni.u_seed) + sin(uv.y * f * 2.3 + uni.u_seed * 1.7) * 0.5,
    cos(uv.x * f * 0.8 + uni.u_seed * 1.3)
  );
  let displaced = uv + warp * (uni.u_intensity / uni.u_resolution);
  return textureSampleLevel(tex, smp, displaced, 0.0);
}"#;

/// Applies a `DisplacementEffect` to `source`, writing `dest` (TS `applyDisplacementEffectToWgpu`).
pub fn apply_displacement_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &DisplacementEffect,
) {
    let intensity = effect.intensity.unwrap_or(8.0);
    let frequency = effect.frequency.unwrap_or(12.0);
    let seed = effect.seed.unwrap_or(0.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "lens.displacement",
        DISPLACEMENT_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
            f32[1] = frequency;
            f32[2] = seed;
            f32[4] = resolution.width;
            f32[5] = resolution.height;
        },
    );
}

/// Registers the default runner under `DisplacementEffect` (TS `registerWgpuDisplacementEffect`).
pub fn register_wgpu_displacement_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "DisplacementEffect",
        wgpu_displacement_effect_runner,
        None,
    );
}

/// The default `DisplacementEffect` runner (TS `wgpuDisplacementEffectRunner`).
pub fn wgpu_displacement_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<DisplacementEffect>(effect, "wgpuDisplacementEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_displacement_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
