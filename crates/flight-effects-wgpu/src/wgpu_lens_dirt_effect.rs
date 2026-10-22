// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Lens dirt (TS `wgpuLensDirtEffect.ts`): isolate bright energy, spread it spatially, then admit
//! it through a procedural smudge mask. The bright branch must blur before the mask: masking only
//! the source pixel cannot carry energy into the dark background.

use flight_effects::{Effect, LensDirtEffect};
use flight_entity::Ref;
use flight_render_wgpu::{
    WgpuEffectContext, WgpuRenderState, WgpuRenderTargetPool, WgpuTextureRenderTarget,
    WgpuTextureRenderTargetDescriptor, acquire_wgpu_texture_render_target,
    release_wgpu_texture_render_target,
};

use crate::types::*;
use crate::wgpu_blur_effect::apply_gaussian_blur_to_wgpu;
use crate::wgpu_effect_pass::{
    create_wgpu_dual_source_effect_pipeline, draw_wgpu_dual_source_effect_pass,
    draw_wgpu_effect_pass,
};
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_runtime::get_wgpu_effect_module_pipeline;

const LENS_DIRT_BRIGHT_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_threshold : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.299, 0.587, 0.114));
  let bright = max(0.0, lum - uni.u_threshold);
  return vec4f(c.rgb * (bright / max(lum, 0.00001)), c.a);
}"#;

const LENS_DIRT_COMPOSITE_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_intensity : f32,
  u_seed : f32,
  _pad0 : f32,
  _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var sceneTex : texture_2d<f32>;
@group(1) @binding(1) var sceneSmp : sampler;
@group(2) @binding(0) var brightTex : texture_2d<f32>;
@group(2) @binding(1) var brightSmp : sampler;

fn dirtHash(p : vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123); }

fn dirtAmount(uv : vec2f, seed : f32) -> f32 {
  var acc = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let fi = f32(i);
    let c = vec2f(dirtHash(vec2f(fi, seed)), dirtHash(vec2f(fi + 9.0, seed)));
    let r = 0.06 + 0.16 * dirtHash(vec2f(fi + 3.0, seed));
    let d = distance(uv, c) / r;
    acc = acc + smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2f(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(sceneTex, sceneSmp, uv, 0.0);
  let bright = textureSampleLevel(brightTex, brightSmp, uv, 0.0).rgb;
  let dirt = dirtAmount(uv, uni.u_seed + 1.0);
  return vec4f(scene.rgb + bright * dirt * uni.u_intensity * 2.0, scene.a);
}"#;

// Lens dirt is a broad optical contamination layer; sigma 8 matches the default bloom spread while
// keeping its extent independent from the procedural blob sizes, which control the mask.
const LENS_DIRT_BLUR_SIGMA: f32 = 8.0;

/// Spreads `source`'s bright energy through the dirt mask into `dest` (TS
/// `applyLensDirtEffectToWgpu`).
pub fn apply_lens_dirt_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &LensDirtEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let threshold = effect.threshold.unwrap_or(0.55);
    let seed = effect.seed.unwrap_or(0.0);
    let descriptor = WgpuTextureRenderTargetDescriptor {
        color_space: None,
        format: Some(source.format),
        height: source.height as f32,
        sample_count: None,
        width: source.width as f32,
    };
    let bright = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let blurred = acquire_wgpu_texture_render_target(state, pool, &descriptor);
    let temp = acquire_wgpu_texture_render_target(state, pool, &descriptor);

    let bright_pipeline = get_wgpu_effect_pipeline(
        state,
        "lens.lensDirt.bright",
        LENS_DIRT_BRIGHT_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(&bright.read().unwrap()),
        &mut bright_pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = threshold;
        },
    );

    apply_gaussian_blur_to_wgpu(
        state,
        &bright.read().unwrap(),
        &blurred.read().unwrap(),
        &temp.read().unwrap(),
        &WgpuGaussianBlurOptions {
            blur_x: Some(LENS_DIRT_BLUR_SIGMA),
            blur_y: Some(LENS_DIRT_BLUR_SIGMA),
        },
    );

    let composite_pipeline = get_lens_dirt_composite_pipeline(state);
    draw_wgpu_dual_source_effect_pass(
        state,
        source,
        &blurred.read().unwrap(),
        Some(dest),
        &mut composite_pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
            f32[1] = seed;
        },
    );

    release_wgpu_texture_render_target(pool, bright);
    release_wgpu_texture_render_target(pool, blurred);
    release_wgpu_texture_render_target(pool, temp);
}

fn get_lens_dirt_composite_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "lensDirt.composite", |state| {
        return create_wgpu_dual_source_effect_pipeline(
            state,
            LENS_DIRT_COMPOSITE_FRAGMENT_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
}

/// Registers the default runner under `LensDirtEffect` (TS `registerWgpuLensDirtEffect`).
pub fn register_wgpu_lens_dirt_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "LensDirtEffect", wgpu_lens_dirt_effect_runner, None);
}

/// The default `LensDirtEffect` runner (TS `wgpuLensDirtEffectRunner`).
pub fn wgpu_lens_dirt_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<LensDirtEffect>(effect, "wgpuLensDirtEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_lens_dirt_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
