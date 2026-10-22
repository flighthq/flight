// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Vignette (TS `wgpuVignetteEffect.ts`).

use flight_effects::{Effect, VignetteEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const VIGNETTE_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_intensity : f32,
  u_radius : f32,
  u_softness : f32,
  _pad0 : f32,
  u_color : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let centered = uv - vec2f(0.5);
  let dist = length(centered) * 1.41421356;
  let vig = smoothstep(uni.u_radius, uni.u_radius - uni.u_softness, dist);
  let darken = (1.0 - vig) * uni.u_intensity * uni.u_color.a;
  return vec4f(mix(c.rgb, uni.u_color.rgb, darken), c.a);
}"#;

/// Vignette: darkens toward the edges. Pixels inside `radius` stay full bright; beyond it brightness
/// falls off over `softness` and the color blends toward the unpacked vignette color by intensity (TS `applyVignetteEffectToWgpu`).
pub fn apply_vignette_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &VignetteEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let radius = effect.radius.unwrap_or(0.75);
    let softness = effect.softness.unwrap_or(0.45);
    let color = effect.color.unwrap_or(0x000000ff);
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "lens.vignette",
        VIGNETTE_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
            f32[1] = radius;
            f32[2] = softness;
            f32[4] = r;
            f32[5] = g;
            f32[6] = b;
            f32[7] = a;
        },
    );
}

/// Registers the default runner under `VignetteEffect` (TS `registerWgpuVignetteEffect`).
pub fn register_wgpu_vignette_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "VignetteEffect", wgpu_vignette_effect_runner, None);
}

/// The default `VignetteEffect` runner (TS `wgpuVignetteEffectRunner`).
pub fn wgpu_vignette_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<VignetteEffect>(effect, "wgpuVignetteEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_vignette_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
