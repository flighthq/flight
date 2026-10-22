// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! SSAO (TS `wgpuSsaoEffect.ts`): an ambient-occlusion stand-in. Real SSAO reconstructs view-space
//! positions from a sampleable depth texture; WebGPU has no depth G-buffer yet, so this darkens
//! fragments by local luminance variation scaled by intensity, stepping neighbors in logical texels.

use flight_effects::{Effect, SsaoEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;
use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const SSAO_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_radius : f32,
  u_intensity : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = (1.0 / uni.u_resolution) * max(uni.u_radius, 1.0);
  let center = textureSampleLevel(tex, smp, uv, 0.0);
  let lc = luma(center.rgb);
  var variation = 0.0;
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb));
  variation = variation * 0.25;
  let occlusion = clamp(variation * uni.u_intensity, 0.0, 1.0);
  return vec4f(center.rgb * (1.0 - occlusion), center.a);
}"#;

/// Darkens `source` by local luminance variation into `dest` (TS `applySsaoEffectToWgpu`).
pub fn apply_ssao_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &SsaoEffect,
) {
    let radius = effect.radius.unwrap_or(1.0);
    let intensity = effect.intensity.unwrap_or(1.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "atmospheric.ssao",
        SSAO_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = radius;
            f32[1] = intensity;
            f32[2] = resolution.width;
            f32[3] = resolution.height;
        },
    );
}

/// Registers the default runner under `SsaoEffect` (TS `registerWgpuSsaoEffect`).
pub fn register_wgpu_ssao_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "SsaoEffect", wgpu_ssao_effect_runner, None);
}

/// The default `SsaoEffect` runner (TS `wgpuSsaoEffectRunner`).
pub fn wgpu_ssao_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<SsaoEffect>(effect, "wgpuSsaoEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_ssao_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
