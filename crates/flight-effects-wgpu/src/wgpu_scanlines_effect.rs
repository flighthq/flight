// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Scanlines (TS `wgpuScanlinesEffect.ts`).

use flight_effects::{Effect, ScanlinesEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const SCANLINES_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_count : f32,
  u_intensity : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let line = sin(uv.y * uni.u_count * 3.14159265) * 0.5 + 0.5;
  return vec4f(c.rgb * (1.0 - uni.u_intensity * (1.0 - line)), c.a);
}"#;

/// Scanlines: darkens by a vertical sine band; `count` sets the line density, `intensity` the
/// darkening (TS `applyScanlinesEffectToWgpu`).
pub fn apply_scanlines_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &ScanlinesEffect,
) {
    let count = effect.count.unwrap_or(240.0);
    let intensity = effect.intensity.unwrap_or(0.3);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.scanlines",
        SCANLINES_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = count;
            f32[1] = intensity;
        },
    );
}

/// Registers the default runner under `ScanlinesEffect` (TS `registerWgpuScanlinesEffect`).
pub fn register_wgpu_scanlines_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "ScanlinesEffect", wgpu_scanlines_effect_runner, None);
}

/// The default `ScanlinesEffect` runner (TS `wgpuScanlinesEffectRunner`).
pub fn wgpu_scanlines_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<ScanlinesEffect>(effect, "wgpuScanlinesEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_scanlines_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
