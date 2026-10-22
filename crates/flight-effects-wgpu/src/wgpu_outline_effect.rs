// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Outline (TS `wgpuOutlineEffect.ts`): Sobel edge detection on luminance; where the gradient
//! magnitude exceeds `threshold`, the pixel mixes toward the outline color by `thickness`. The color
//! arrives packed RGBA and is unpacked to 0..1 here.

use flight_effects::{Effect, OutlineEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

// Slot layout: [0]=threshold, [1]=thickness, [2..3]=resolution, [4..7]=color rgba.
const OUTLINE_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_threshold : f32,
  u_thickness : f32,
  u_resolution : vec2f,
  u_color : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn lum(uv : vec2f) -> f32 {
  return dot(textureSampleLevel(tex, smp, uv, 0.0).rgb, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = uni.u_thickness / uni.u_resolution;
  let tl = lum(uv + texel * vec2f(-1.0, -1.0));
  let t = lum(uv + texel * vec2f(0.0, -1.0));
  let tr = lum(uv + texel * vec2f(1.0, -1.0));
  let l = lum(uv + texel * vec2f(-1.0, 0.0));
  let rr = lum(uv + texel * vec2f(1.0, 0.0));
  let bl = lum(uv + texel * vec2f(-1.0, 1.0));
  let b = lum(uv + texel * vec2f(0.0, 1.0));
  let br = lum(uv + texel * vec2f(1.0, 1.0));
  let gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  let gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  let edge = sqrt(gx * gx + gy * gy);
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let k = step(uni.u_threshold, edge);
  return mix(c, uni.u_color, k * uni.u_color.a);
}"#;

/// Applies an `OutlineEffect` from `source` into `dest` (TS `applyOutlineEffectToWgpu`).
pub fn apply_outline_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &OutlineEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.2);
    let thickness = effect.thickness.unwrap_or(1.0);
    let color = effect.color.unwrap_or(0x000000ff);
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    let width = source.width as f32;
    let height = source.height as f32;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.outline",
        OUTLINE_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = threshold;
            f32[1] = thickness;
            // u_resolution (vec2f) aligns to slot [2].
            f32[2] = width;
            f32[3] = height;
            // u_color (vec4f) aligns to slot [4].
            f32[4] = r;
            f32[5] = g;
            f32[6] = b;
            f32[7] = a;
        },
    );
}

/// Registers the default runner under `OutlineEffect` (TS `registerWgpuOutlineEffect`).
pub fn register_wgpu_outline_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "OutlineEffect", wgpu_outline_effect_runner, None);
}

/// The default `OutlineEffect` runner (TS `wgpuOutlineEffectRunner`).
pub fn wgpu_outline_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<OutlineEffect>(effect, "wgpuOutlineEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_outline_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
