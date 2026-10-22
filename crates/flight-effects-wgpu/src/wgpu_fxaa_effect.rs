// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! FXAA: luminance edge detection plus a directional blend along the detected edge. A physical raster kernel: the texel size is the actual source resolution. (TS `wgpuFxaaEffect.ts`).

use flight_effects::{Effect, FxaaEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const FXAA_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_resolution : vec2f, u_edgeThreshold : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let rgbM = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let rgbNW = textureSampleLevel(tex, smp, uv + vec2f(-1.0, -1.0) * texel, 0.0).rgb;
  let rgbNE = textureSampleLevel(tex, smp, uv + vec2f(1.0, -1.0) * texel, 0.0).rgb;
  let rgbSW = textureSampleLevel(tex, smp, uv + vec2f(-1.0, 1.0) * texel, 0.0).rgb;
  let rgbSE = textureSampleLevel(tex, smp, uv + vec2f(1.0, 1.0) * texel, 0.0).rgb;
  let lumaM = luma(rgbM);
  let lumaNW = luma(rgbNW);
  let lumaNE = luma(rgbNE);
  let lumaSW = luma(rgbSW);
  let lumaSE = luma(rgbSE);
  let lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  let lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  let range = lumaMax - lumaMin;
  if (range < max(uni.u_edgeThreshold, lumaMax * 0.125)) {
    return vec4f(rgbM, textureSampleLevel(tex, smp, uv, 0.0).a);
  }
  var dir : vec2f;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  let dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
  let rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2f(-8.0), vec2f(8.0)) * texel;
  let rgbA = 0.5 * (
    textureSampleLevel(tex, smp, uv + dir * (1.0 / 3.0 - 0.5), 0.0).rgb +
    textureSampleLevel(tex, smp, uv + dir * (2.0 / 3.0 - 0.5), 0.0).rgb);
  let rgbB = rgbA * 0.5 + 0.25 * (
    textureSampleLevel(tex, smp, uv + dir * -0.5, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + dir * 0.5, 0.0).rgb);
  let lumaB = luma(rgbB);
  let result = select(rgbB, rgbA, lumaB < lumaMin || lumaB > lumaMax);
  return vec4f(result, textureSampleLevel(tex, smp, uv, 0.0).a);
}"#;

/// Applies a `FxaaEffect` to `source`, writing `dest` (TS `applyFxaaEffectToWgpu`).
pub fn apply_fxaa_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &FxaaEffect,
) {
    let edge_threshold = effect.edge_threshold.unwrap_or(0.0312);
    // Intentional PHYSICAL raster kernel: its one-texel neighborhood follows the actual source texture.
    let width = source.width as f32;
    let height = source.height as f32;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "antialiasing.fxaa",
        FXAA_FRAGMENT_WGSL,
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
            f32[2] = edge_threshold;
        },
    );
}

/// Registers the default runner under `FxaaEffect` (TS `registerWgpuFxaaEffect`).
pub fn register_wgpu_fxaa_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "FxaaEffect", wgpu_fxaa_effect_runner, None);
}

/// The default `FxaaEffect` runner (TS `wgpuFxaaEffectRunner`).
pub fn wgpu_fxaa_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<FxaaEffect>(effect, "wgpuFxaaEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_fxaa_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
