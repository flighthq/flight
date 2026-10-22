// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! SMAA (TS `wgpuSmaaEffect.ts`).

use flight_effects::{Effect, SmaaEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const SMAA_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_resolution : vec2f, u_threshold : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let center = textureSampleLevel(tex, smp, uv, 0.0);
  let lumaC = luma(center.rgb);
  let lumaL = luma(textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb);
  let lumaR = luma(textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb);
  let lumaT = luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb);
  let lumaB = luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb);
  let edge = max(abs(lumaC - lumaL), max(abs(lumaC - lumaR), max(abs(lumaC - lumaT), abs(lumaC - lumaB))));
  if (edge < uni.u_threshold) {
    return center;
  }
  let blurred = (
    textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb +
    center.rgb) / 5.0;
  return vec4f(blurred, center.a);
}"#;

/// SMAA: a single-pass edge-aware blur approximation that softens detected edges only. Full SMAA
/// needs separate edge-detection and blend-weight passes against lookup textures (TS `applySmaaEffectToWgpu`).
pub fn apply_smaa_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &SmaaEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.1);
    // Intentional PHYSICAL raster kernel: its one-texel neighborhood follows the actual source texture.
    let width = source.width as f32;
    let height = source.height as f32;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "antialiasing.smaa",
        SMAA_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = width;
            f32[1] = height;
            f32[2] = threshold;
        },
    );
}

/// Registers the default runner under `SmaaEffect` (TS `registerWgpuSmaaEffect`).
pub fn register_wgpu_smaa_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "SmaaEffect", wgpu_smaa_effect_runner, None);
}

/// The default `SmaaEffect` runner (TS `wgpuSmaaEffectRunner`).
pub fn wgpu_smaa_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<SmaaEffect>(effect, "wgpuSmaaEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_smaa_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
