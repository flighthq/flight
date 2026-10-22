// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Chromatic aberration: samples the R/G/B channels at progressively larger offsets so colors fringe apart. When radial, the offset scales with distance from the optical center; otherwise it is a uniform horizontal split. (TS `wgpuChromaticAberrationEffect.ts`).

use flight_effects::{ChromaticAberrationEffect, Effect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const CHROMATIC_ABERRATION_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_intensity : f32,
  u_radial : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let centered = uv - vec2f(0.5);
  let scale = mix(1.0, length(centered) * 2.0, uni.u_radial);
  let dir = mix(vec2f(1.0, 0.0), normalize(centered + vec2f(1e-5)), uni.u_radial);
  let offset = dir * uni.u_intensity * scale;
  let r = textureSampleLevel(tex, smp, uv + offset, 0.0).r;
  let g = textureSampleLevel(tex, smp, uv, 0.0).g;
  let b = textureSampleLevel(tex, smp, uv - offset, 0.0).b;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(r, g, b, a);
}"#;

/// Applies a `ChromaticAberrationEffect` to `source`, writing `dest` (TS `applyChromaticAberrationEffectToWgpu`).
pub fn apply_chromatic_aberration_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &ChromaticAberrationEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.005);
    let radial = effect.radial.unwrap_or(true);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "lens.chromaticAberration",
        CHROMATIC_ABERRATION_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
            f32[1] = if radial { 1.0 } else { 0.0 };
        },
    );
}

/// Registers the default runner under `ChromaticAberrationEffect` (TS `registerWgpuChromaticAberrationEffect`).
pub fn register_wgpu_chromatic_aberration_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "ChromaticAberrationEffect",
        wgpu_chromatic_aberration_effect_runner,
        None,
    );
}

/// The default `ChromaticAberrationEffect` runner (TS `wgpuChromaticAberrationEffectRunner`).
pub fn wgpu_chromatic_aberration_effect_runner(
    ctx: &mut WgpuEffectContext<'_>,
    effect: &dyn Effect,
) {
    let effect = downcast_wgpu_effect::<ChromaticAberrationEffect>(
        effect,
        "wgpuChromaticAberrationEffectRunner",
    );
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_chromatic_aberration_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
