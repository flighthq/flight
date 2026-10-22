// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Pixelate (TS `wgpuPixelateEffect.ts`).

use flight_effects::{Effect, PixelateEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const PIXELATE_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_size : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uvIn : vec2f) -> @location(0) vec4f {
  let blocks = uni.u_resolution / uni.u_size;
  let uv = (floor(uvIn * blocks) + 0.5) / blocks;
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

/// Pixelate: snaps uv to the center of `size`-pixel blocks before sampling, producing hard mosaic
/// blocks (TS `applyPixelateEffectToWgpu`).
pub fn apply_pixelate_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &PixelateEffect,
) {
    let size = effect.size.unwrap_or(8.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.pixelate",
        PIXELATE_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = 1.0_f32.max(size);
            // u_resolution (vec2f) aligns to slot [2].
            f32[2] = resolution.width;
            f32[3] = resolution.height;
        },
    );
}

/// Registers the default runner under `PixelateEffect` (TS `registerWgpuPixelateEffect`).
pub fn register_wgpu_pixelate_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "PixelateEffect", wgpu_pixelate_effect_runner, None);
}

/// The default `PixelateEffect` runner (TS `wgpuPixelateEffectRunner`).
pub fn wgpu_pixelate_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<PixelateEffect>(effect, "wgpuPixelateEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_pixelate_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
