// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Tilt-shift (TS `wgpuTiltShiftEffect.ts`).

use flight_effects::{Effect, TiltShiftEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const TILT_SHIFT_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_center : f32,
  u_width : f32,
  u_blur : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = vec2f(1.0) / uni.u_resolution;
  let dist = abs(uv.y - uni.u_center);
  let edge = uni.u_width * 0.5;
  let amount = smoothstep(edge, edge + uni.u_width, dist);
  let radius = amount * uni.u_blur;
  var sum = vec4f(0.0);
  var total = 0.0;
  for (var i = -3; i <= 3; i = i + 1) {
    let offset = vec2f(0.0, f32(i)) * radius * texel;
    sum = sum + textureSampleLevel(tex, smp, uv + offset, 0.0);
    total = total + 1.0;
  }
  return sum / total;
}"#;

/// Tilt-shift: keeps a horizontal focus band sharp and blurs above and below it. The band is centered
/// at `center` on Y with height `width`; blur ramps with distance outside the band (TS `applyTiltShiftEffectToWgpu`).
pub fn apply_tilt_shift_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &TiltShiftEffect,
) {
    let center = effect.center.unwrap_or(0.5);
    let width = effect.width.unwrap_or(0.3);
    let blur = effect.blur.unwrap_or(4.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "lens.tiltShift",
        TILT_SHIFT_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = center;
            f32[1] = width;
            f32[2] = blur;
            f32[4] = resolution.width;
            f32[5] = resolution.height;
        },
    );
}

/// Registers the default runner under `TiltShiftEffect` (TS `registerWgpuTiltShiftEffect`).
pub fn register_wgpu_tilt_shift_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "TiltShiftEffect",
        wgpu_tilt_shift_effect_runner,
        None,
    );
}

/// The default `TiltShiftEffect` runner (TS `wgpuTiltShiftEffectRunner`).
pub fn wgpu_tilt_shift_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<TiltShiftEffect>(effect, "wgpuTiltShiftEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_tilt_shift_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
