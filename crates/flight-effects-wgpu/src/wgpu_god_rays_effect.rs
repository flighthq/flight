// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! God rays (TS `wgpuGodRaysEffect.ts`): radial light scattering from a screen-space light position.
//! Marches the sample count along the ray from each fragment toward the light, accumulating color
//! with per-step decay and weight, then scales by exposure. The sample count is baked into the WGSL
//! (a loop bound must be const) and keyed into the pipeline cache, so each count compiles once.

use flight_effects::{Effect, GodRaysEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

// Slot layout: [0]=centerX, [1]=centerY, [2]=density, [3]=decay, [4]=weight, [5]=exposure. All
// scalars pack into one vec4-aligned run, so no padding gaps are needed.
const GOD_RAYS_FRAGMENT_HEAD: &str = r#"
struct Uniforms {
  u_centerX : f32,
  u_centerY : f32,
  u_density : f32,
  u_decay : f32,
  u_weight : f32,
  u_exposure : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = "#;

const GOD_RAYS_FRAGMENT_TAIL: &str = r#";

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let light = vec2f(uni.u_centerX, uni.u_centerY);
  let delta = (uv - light) * (uni.u_density / f32(SAMPLES));
  var coord = uv;
  let base = textureSampleLevel(tex, smp, uv, 0.0);
  var accum = base.rgb;
  var illumination = 1.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    coord = coord - delta;
    var s = textureSampleLevel(tex, smp, coord, 0.0).rgb;
    s = s * (illumination * uni.u_weight);
    accum = accum + s;
    illumination = illumination * uni.u_decay;
  }
  return vec4f(base.rgb + accum * uni.u_exposure, base.a);
}"#;

/// Marches light shafts from the effect's light position into `dest` (TS
/// `applyGodRaysEffectToWgpu`). `center_y` is top-left-origin, the same as this backend's
/// fullscreen uv, so it passes through unconverted (the GL sibling must flip).
pub fn apply_god_rays_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &GodRaysEffect,
) {
    let center_x = effect.center_x.unwrap_or(0.5);
    let center_y = effect.center_y.unwrap_or(0.5);
    let density = effect.density.unwrap_or(0.96);
    let decay = effect.decay.unwrap_or(0.93);
    let weight = effect.weight.unwrap_or(0.4);
    let exposure = effect.exposure.unwrap_or(0.6);
    let samples = 1.0_f32.max((effect.samples.unwrap_or(64.0) + 0.5).floor()) as u32;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        &format!("atmospheric.godRays.{samples}"),
        &build_god_rays_fragment(samples),
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = center_x;
            f32[1] = center_y;
            f32[2] = density;
            f32[3] = decay;
            f32[4] = weight;
            f32[5] = exposure;
        },
    );
}

fn build_god_rays_fragment(samples: u32) -> String {
    return format!("{GOD_RAYS_FRAGMENT_HEAD}{samples}{GOD_RAYS_FRAGMENT_TAIL}");
}

/// Registers the default runner under `GodRaysEffect` (TS `registerWgpuGodRaysEffect`).
pub fn register_wgpu_god_rays_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "GodRaysEffect", wgpu_god_rays_effect_runner, None);
}

/// The default `GodRaysEffect` runner (TS `wgpuGodRaysEffectRunner`).
pub fn wgpu_god_rays_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<GodRaysEffect>(effect, "wgpuGodRaysEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_god_rays_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
