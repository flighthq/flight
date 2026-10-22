// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Posterize (TS `wgpuPosterizeEffect.ts`).

use flight_effects::{Effect, PosterizeEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const POSTERIZE_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_levels : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let rgb = floor(c.rgb * uni.u_levels) / (uni.u_levels - 1.0);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

/// Posterize: floors each channel to `levels` discrete steps (TS `applyPosterizeEffectToWgpu`).
pub fn apply_posterize_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &PosterizeEffect,
) {
    let levels = 2.0_f32.max(effect.levels.unwrap_or(8.0));
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "colorGrade.posterize",
        POSTERIZE_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = levels;
        },
    );
}

/// Registers the default runner under `PosterizeEffect` (TS `registerWgpuPosterizeEffect`).
pub fn register_wgpu_posterize_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "PosterizeEffect", wgpu_posterize_effect_runner, None);
}

/// The default `PosterizeEffect` runner (TS `wgpuPosterizeEffectRunner`).
pub fn wgpu_posterize_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<PosterizeEffect>(effect, "wgpuPosterizeEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_posterize_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
