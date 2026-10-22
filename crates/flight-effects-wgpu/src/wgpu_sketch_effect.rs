// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Sketch (TS `wgpuSketchEffect.ts`): luminance edges inverted into dark pencil strokes over a
//! light page; `strength` scales how dark the strokes get.

use flight_effects::{Effect, SketchEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

// Slot layout: [0]=strength, [1]=pad, [2..3]=resolution.
const SKETCH_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_strength : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn lum(uv : vec2f) -> f32 {
  return dot(textureSampleLevel(tex, smp, uv, 0.0).rgb, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
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
  let pencil = clamp(1.0 - edge * uni.u_strength, 0.0, 1.0);
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(vec3f(pencil), a);
}"#;

/// Applies a `SketchEffect` from `source` into `dest` (TS `applySketchEffectToWgpu`).
pub fn apply_sketch_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &SketchEffect,
) {
    let strength = effect.strength.unwrap_or(1.0);
    let width = source.width as f32;
    let height = source.height as f32;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.sketch",
        SKETCH_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = strength;
            // u_resolution (vec2f) aligns to slot [2].
            f32[2] = width;
            f32[3] = height;
        },
    );
}

/// Registers the default runner under `SketchEffect` (TS `registerWgpuSketchEffect`).
pub fn register_wgpu_sketch_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "SketchEffect", wgpu_sketch_effect_runner, None);
}

/// The default `SketchEffect` runner (TS `wgpuSketchEffectRunner`).
pub fn wgpu_sketch_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<SketchEffect>(effect, "wgpuSketchEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_sketch_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
