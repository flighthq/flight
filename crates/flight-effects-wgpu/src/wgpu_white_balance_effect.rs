// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! White balance (TS `wgpuWhiteBalanceEffect.ts`).

use flight_effects::{Effect, WhiteBalanceEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const WHITE_BALANCE_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_temperature : f32, u_tint : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb;
  rgb.r += uni.u_temperature * 0.5;
  rgb.b -= uni.u_temperature * 0.5;
  rgb.g += uni.u_tint * 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

/// White balance: a warm/cool temperature and magenta/green tint channel shift (TS `applyWhiteBalanceEffectToWgpu`).
pub fn apply_white_balance_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &WhiteBalanceEffect,
) {
    let temperature = effect.temperature.unwrap_or(0.0);
    let tint = effect.tint.unwrap_or(0.0);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "colorGrade.whiteBalance",
        WHITE_BALANCE_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = temperature;
            f32[1] = tint;
        },
    );
}

/// Registers the default runner under `WhiteBalanceEffect` (TS `registerWgpuWhiteBalanceEffect`).
pub fn register_wgpu_white_balance_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "WhiteBalanceEffect",
        wgpu_white_balance_effect_runner,
        None,
    );
}

/// The default `WhiteBalanceEffect` runner (TS `wgpuWhiteBalanceEffectRunner`).
pub fn wgpu_white_balance_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<WhiteBalanceEffect>(effect, "wgpuWhiteBalanceEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_white_balance_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
