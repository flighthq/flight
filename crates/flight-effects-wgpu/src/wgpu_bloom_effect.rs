// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets and pools
//! Bloom (TS `wgpuBloomEffect.ts`): bright-pass, blur the bright branch with the shared separable
//! Gaussian, then additively composite it back. The multi-pass reference recipe: it acquires
//! intermediate targets from the pool and releases them, branches, and reuses the blur primitive.
//! Parameters come from the shared `compute_bloom_*` helpers, as on GL.

use flight_effects::{
    BloomEffect, Effect, compute_bloom_blur_radius, compute_bloom_intensity,
    compute_bloom_threshold,
};
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

const BLOOM_BRIGHT_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_threshold : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let l = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let k = step(uni.u_threshold, l);
  return vec4f(c.rgb * k, c.a);
}"#;

const BLOOM_COMPOSITE_FRAGMENT_WGSL: &str = r#"
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex0 : texture_2d<f32>;
@group(1) @binding(1) var smp0 : sampler;
@group(2) @binding(0) var tex1 : texture_2d<f32>;
@group(2) @binding(1) var smp1 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(tex0, smp0, uv, 0.0);
  let bloom = textureSampleLevel(tex1, smp1, uv, 0.0);
  return vec4f(scene.rgb + bloom.rgb * uni.u_intensity, scene.a);
}"#;

/// Bright-passes, blurs and composites `source` into `dest` (TS `applyBloomEffectToWgpu`).
pub fn apply_bloom_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &BloomEffect,
) {
    let threshold = compute_bloom_threshold(effect);
    let intensity = compute_bloom_intensity(effect);
    let radius = compute_bloom_blur_radius(effect);
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
        "bloom.bright",
        BLOOM_BRIGHT_FRAGMENT_WGSL,
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
            blur_x: Some(radius),
            blur_y: Some(radius),
        },
    );

    let composite_pipeline = get_bloom_composite_pipeline(state);
    draw_wgpu_dual_source_effect_pass(
        state,
        source,
        &blurred.read().unwrap(),
        Some(dest),
        &mut composite_pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
        },
    );

    release_wgpu_texture_render_target(pool, bright);
    release_wgpu_texture_render_target(pool, blurred);
    release_wgpu_texture_render_target(pool, temp);
}

// The composite reads two textures (scene = group 1, blurred = group 2), so it uses the dual-source
// primitive; cached per state alongside the single-source pipelines.
fn get_bloom_composite_pipeline(state: &mut WgpuRenderState) -> Ref<WgpuEffectPipeline> {
    return get_wgpu_effect_module_pipeline(state, "bloom.composite", |state| {
        return create_wgpu_dual_source_effect_pipeline(
            state,
            BLOOM_COMPOSITE_FRAGMENT_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
}

/// Registers the default runner under `BloomEffect` (TS `registerWgpuBloomEffect`).
pub fn register_wgpu_bloom_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "BloomEffect", wgpu_bloom_effect_runner, None);
}

/// The default `BloomEffect` runner (TS `wgpuBloomEffectRunner`).
pub fn wgpu_bloom_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<BloomEffect>(effect, "wgpuBloomEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_bloom_effect_to_wgpu(ctx.state, &source, &dest, ctx.pool, effect);
}
