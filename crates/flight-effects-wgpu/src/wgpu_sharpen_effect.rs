// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Sharpen (TS `wgpuSharpenEffect.ts`).

use flight_effects::{Effect, SharpenEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const SHARPEN_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_amount : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let c = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let n = textureSampleLevel(tex, smp, uv + vec2f(0.0, -texel.y), 0.0).rgb;
  let s = textureSampleLevel(tex, smp, uv + vec2f(0.0, texel.y), 0.0).rgb;
  let e = textureSampleLevel(tex, smp, uv + vec2f(texel.x, 0.0), 0.0).rgb;
  let w = textureSampleLevel(tex, smp, uv + vec2f(-texel.x, 0.0), 0.0).rgb;
  let high = c * 4.0 - n - s - e - w;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(clamp(c + high * uni.u_amount, vec3f(0.0), vec3f(1.0)), a);
}"#;

/// Sharpen: an unsharp mask via a 3x3 Laplacian kernel; `amount` scales the high-frequency boost (TS `applySharpenEffectToWgpu`).
pub fn apply_sharpen_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &SharpenEffect,
) {
    let amount = effect.amount.unwrap_or(0.5);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.sharpen",
        SHARPEN_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = amount;
            // u_resolution (vec2f) aligns to slot [2].
            f32[2] = resolution.width;
            f32[3] = resolution.height;
        },
    );
}

/// Registers the default runner under `SharpenEffect` (TS `registerWgpuSharpenEffect`).
pub fn register_wgpu_sharpen_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "SharpenEffect", wgpu_sharpen_effect_runner, None);
}

/// The default `SharpenEffect` runner (TS `wgpuSharpenEffectRunner`).
pub fn wgpu_sharpen_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<SharpenEffect>(effect, "wgpuSharpenEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_sharpen_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
