// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Halftone: samples luminance, then carves a rotated dot grid whose dot radius tracks darkness. `scale` sets the cell size in pixels, `angle` (degrees) rotates the grid. (TS `wgpuHalftoneEffect.ts`).

use flight_effects::{Effect, HalftoneEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

/// The halftone fragment WGSL (TS module-private `HALFTONE_FRAGMENT_WGSL`, public here so tests can
/// evaluate its cell wrap; the source test reads it through a spy on the program cache).
pub const HALFTONE_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_scale : f32,
  u_angle : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let p = uv * uni.u_resolution;
  let s = sin(uni.u_angle);
  let co = cos(uni.u_angle);
  let rp = vec2f(p.x * co - p.y * s, p.x * s + p.y * co);
  let scale = vec2f(uni.u_scale);
  let wrapped = rp - floor(rp / scale) * scale;
  let cell = wrapped - scale * 0.5;
  let dist = length(cell) / (uni.u_scale * 0.5);
  let radius = sqrt(1.0 - lum);
  let dot1 = step(dist, radius);
  return vec4f(c.rgb * dot1, c.a);
}"#;

/// Applies a `HalftoneEffect` to `source`, writing `dest` (TS `applyHalftoneEffectToWgpu`).
pub fn apply_halftone_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &HalftoneEffect,
) {
    let scale = effect.scale.unwrap_or(6.0);
    let angle = (effect.angle.unwrap_or(22.92) * std::f32::consts::PI) / 180.0;
    let width = source.width as f32;
    let height = source.height as f32;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.halftone",
        HALFTONE_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = 1.0_f32.max(scale);
            f32[1] = angle;
            f32[2] = width;
            f32[3] = height;
        },
    );
}

/// Registers the default runner under `HalftoneEffect` (TS `registerWgpuHalftoneEffect`).
pub fn register_wgpu_halftone_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "HalftoneEffect", wgpu_halftone_effect_runner, None);
}

/// The default `HalftoneEffect` runner (TS `wgpuHalftoneEffectRunner`).
pub fn wgpu_halftone_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<HalftoneEffect>(effect, "wgpuHalftoneEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_halftone_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
