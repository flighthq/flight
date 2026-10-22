// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Dither: quantizes each channel to `levels` steps with a 4x4 ordered Bayer threshold for a retro banded-but-textured look. (TS `wgpuDitherEffect.ts`).

use flight_effects::{Effect, DitherEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const DITHER_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_levels : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn bayer(p : vec2i) -> f32 {
  let x = p.x & 3;
  let y = p.y & 3;
  var m = array<i32, 16>(0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return f32(m[y * 4 + x]) / 16.0;
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let px = vec2i(uv * uni.u_resolution);
  let t = bayer(px) - 0.5;
  let steps = uni.u_levels - 1.0;
  let q = floor(c.rgb * steps + 0.5 + t) / steps;
  return vec4f(clamp(q, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

/// Applies a `DitherEffect` to `source`, writing `dest` (TS `applyDitherEffectToWgpu`).
pub fn apply_dither_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &DitherEffect,
) {
    let levels = effect.levels.unwrap_or(4.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.dither",
        DITHER_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = 2.0_f32.max(levels);
            f32[2] = resolution.width;
            f32[3] = resolution.height;
        },
    );
}

/// Registers the default runner under `DitherEffect` (TS `registerWgpuDitherEffect`).
pub fn register_wgpu_dither_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "DitherEffect", wgpu_dither_effect_runner, None);
}

/// The default `DitherEffect` runner (TS `wgpuDitherEffectRunner`).
pub fn wgpu_dither_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<DitherEffect>(effect, "wgpuDitherEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_dither_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
