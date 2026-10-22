// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Lens flare (TS `wgpuLensFlareEffect.ts`): a single-pass approximation. Each fragment samples the
//! source's bright spots along the vector toward the center, adding `ghosts` evenly spaced ghost
//! samples plus a halo ring, scaled by threshold and intensity, without a bright-pass buffer.

use flight_effects::{Effect, LensFlareEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const LENS_FLARE_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_threshold : f32,
  u_intensity : f32,
  u_ghosts : f32,
  u_halo : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn brightPass(uv : vec2f) -> vec3f {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec3f(0.0); }
  let c = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  return c * max(0.0, l - uni.u_threshold);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(tex, smp, uv, 0.0);
  // Single-pass approximation of a flare: walk ghost samples along the vector toward the optical
  // center and add a halo ring, all from the bright pass of the scene itself (no separate buffer).
  let toCenter = vec2f(0.5) - uv;
  var flare = vec3f(0.0);
  let count = i32(clamp(uni.u_ghosts, 0.0, 8.0));
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= count) { break; }
    let t = (f32(i) + 1.0) / (f32(count) + 1.0);
    let ghostUv = uv + toCenter * (2.0 * t);
    flare = flare + brightPass(ghostUv);
  }
  let haloDir = normalize(toCenter + vec2f(1e-5));
  flare = flare + brightPass(uv + haloDir * uni.u_halo) * uni.u_halo;
  return vec4f(scene.rgb + flare * uni.u_intensity, scene.a);
}"#;

/// Adds ghost and halo flares from `source`'s bright spots into `dest` (TS `applyLensFlareEffectToWgpu`).
pub fn apply_lens_flare_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &LensFlareEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.8);
    let intensity = effect.intensity.unwrap_or(1.0);
    let ghosts = effect.ghosts.unwrap_or(4.0);
    let halo = effect.halo.unwrap_or(0.5);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "lens.lensFlare",
        LENS_FLARE_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = threshold;
            f32[1] = intensity;
            f32[2] = ghosts;
            f32[3] = halo;
        },
    );
}

/// Registers the default runner under `LensFlareEffect` (TS `registerWgpuLensFlareEffect`).
pub fn register_wgpu_lens_flare_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "LensFlareEffect", wgpu_lens_flare_effect_runner, None);
}

/// The default `LensFlareEffect` runner (TS `wgpuLensFlareEffectRunner`).
pub fn wgpu_lens_flare_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<LensFlareEffect>(effect, "wgpuLensFlareEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_lens_flare_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
