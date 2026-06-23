//! WGPU HDR / tone-mapping effect recipes.
//!
//! - Bloom: bright-pass → separable gaussian blur of the bright branch →
//!   additive composite.  Multi-pass; acquires intermediate targets from the
//!   pool.
//! - Exposure: single-pass `color * 2^stops`.
//! - Tone map: single-pass operator (ACES, Reinhard, filmic, AGX, Uncharted2).
//!
//! The substrate-agnostic blur radius comes from
//! [`compute_bloom_blur_radius`](flighthq_effects::compute_bloom_blur_radius) so
//! this backend derives the same parameters as the GL backend from one intent.
//!
//! Mirrors the TS `toneEffects` from `effects-webgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::compute_bloom_blur_radius;
use flighthq_effects::types::{BloomEffect, ExposureEffect, ToneMapEffect, ToneMapOperator};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};
use flighthq_render_wgpu::render_target_pool::{
    WgpuRenderTargetPool, acquire_wgpu_render_target, release_wgpu_render_target,
};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_dual_source_effect_pass, draw_wgpu_effect_filter_pass,
    draw_wgpu_effect_gaussian_blur, get_wgpu_dual_source_effect_pipeline, get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{WgpuRenderEffectContext, WgpuRenderEffectRunner};

/// Applies bloom (bright-pass → blur → additive composite) to `source` and
/// writes to `dest`.  Acquires intermediate targets from `pool`.
pub fn apply_bloom_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    pool: &mut WgpuRenderTargetPool,
    effect: &BloomEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.8);
    let intensity = effect.intensity.unwrap_or(1.0);
    let radius = compute_bloom_blur_radius(effect);
    let (w, h, fmt) = (source.width, source.height, Some(source.format));

    let bright = acquire_wgpu_render_target(state, pool, w, h, fmt);
    let blurred = acquire_wgpu_render_target(state, pool, w, h, fmt);
    let temp = acquire_wgpu_render_target(state, pool, w, h, fmt);

    get_wgpu_effect_pipeline(
        state,
        "bloom.bright",
        BLOOM_BRIGHT_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "bloom.bright", source, Some(&bright), |f32s, _| {
        f32s[0] = threshold;
    });

    // Blur the bright branch by reusing filters-wgpu's separable Gaussian blur
    // (the Tier-1 filter), exactly as the TS bloom recipe calls
    // applyGaussianBlurFilterToWgpu — the effect does not reimplement the blur.
    draw_wgpu_effect_gaussian_blur(state, &bright, &blurred, &temp, radius, radius);

    get_wgpu_dual_source_effect_pipeline(
        state,
        "bloom.composite",
        BLOOM_COMPOSITE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_dual_source_effect_pass(
        state,
        "bloom.composite",
        source,
        &blurred.view,
        Some(dest),
        |f32s, _| {
            f32s[0] = intensity;
        },
    );

    release_wgpu_render_target(pool, bright);
    release_wgpu_render_target(pool, blurred);
    release_wgpu_render_target(pool, temp);
}

/// Applies exposure scaling to `source` and writes to `dest`.
pub fn apply_exposure_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &ExposureEffect,
) {
    let multiplier = 2.0f32.powf(effect.exposure.unwrap_or(0.0));
    get_wgpu_effect_pipeline(
        state,
        "exposure",
        EXPOSURE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "exposure", source, Some(dest), |f32s, _| {
        f32s[0] = multiplier;
    });
}

/// Applies tone mapping to `source` and writes to `dest`.
pub fn apply_tone_map_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &ToneMapEffect,
) {
    let operator = effect.operator.unwrap_or(ToneMapOperator::Aces);
    let exposure = effect.exposure.unwrap_or(1.0);
    let white = effect.white.unwrap_or(1.0);
    let key = tone_map_pipeline_key(operator);
    get_wgpu_effect_pipeline(
        state,
        key,
        &build_tone_map_fragment(operator),
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, key, source, Some(dest), |f32s, _| {
        f32s[0] = exposure;
        f32s[1] = white;
    });
}

/// Default WGPU runner for [`BloomEffect`].
pub const DEFAULT_WGPU_BLOOM_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Bloom(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest/pool are live and disjoint from state.
            let (source, dest, pool) = unsafe { (&*ctx.source, &*ctx.dest, &mut *ctx.pool) };
            apply_bloom_effect_to_wgpu(ctx.state, source, dest, pool, effect);
        }
    };

/// Default WGPU runner for [`ExposureEffect`].
pub const DEFAULT_WGPU_EXPOSURE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Exposure(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_exposure_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`ToneMapEffect`].
pub const DEFAULT_WGPU_TONE_MAP_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ToneMap(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_tone_map_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

fn build_tone_map_fragment(operator: ToneMapOperator) -> String {
    let mut wgsl = String::with_capacity(256);
    wgsl.push_str(TONEMAP_FRAGMENT_HEAD);
    wgsl.push_str(tone_map_operator_body(operator));
    wgsl.push_str(TONEMAP_FRAGMENT_TAIL);
    wgsl
}

fn tone_map_pipeline_key(operator: ToneMapOperator) -> &'static str {
    match operator {
        ToneMapOperator::Aces => "toneMap.aces",
        ToneMapOperator::Reinhard => "toneMap.reinhard",
        ToneMapOperator::Filmic => "toneMap.filmic",
        ToneMapOperator::Agx => "toneMap.agx",
        ToneMapOperator::Uncharted2 => "toneMap.uncharted2",
    }
}

fn tone_map_operator_body(operator: ToneMapOperator) -> &'static str {
    match operator {
        ToneMapOperator::Aces => {
            "
  let a = x * (2.51 * x + 0.03);
  let b = x * (2.43 * x + 0.59) + 0.14;
  return a / b;"
        }
        ToneMapOperator::Reinhard => {
            "
  return x / (1.0 + x / (uni.u_white * uni.u_white));"
        }
        ToneMapOperator::Filmic => {
            "
  let X = max(vec3f(0.0), x - 0.004);
  return (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);"
        }
        ToneMapOperator::Uncharted2 => {
            "
  let A = 0.15; let B = 0.50; let C = 0.10; let D = 0.20; let E = 0.02; let F = 0.30;
  let v = ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  return v;"
        }
        ToneMapOperator::Agx => {
            "
  let v = clamp((x - 0.004) / (1.0 + x), vec3f(0.0), vec3f(1.0));
  return pow(v, vec3f(0.8));"
        }
    }
}

const BLOOM_BRIGHT_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
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

const BLOOM_COMPOSITE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
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

// Slot [0]=multiplier (2^stops, precomputed); the scalar struct pads to a 16-byte boundary.
const EXPOSURE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_exposure : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(c.rgb * uni.u_exposure, c.a);
}"#;

// Slots [0]=exposure, [1]=white; the operator body is spliced between head and tail.
const TONEMAP_FRAGMENT_HEAD: &str = /* wgsl */
    r#"
struct Uniforms { u_exposure : f32, u_white : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn tonemap(x : vec3f) -> vec3f {"#;

const TONEMAP_FRAGMENT_TAIL: &str = /* wgsl */
    r#"}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let mapped = tonemap(c.rgb * uni.u_exposure);
  return vec4f(clamp(mapped, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_program_cache::build_wgpu_effect_module_wgsl;

    #[test]
    fn build_tone_map_fragment_splices_operator_body() {
        let aces = build_tone_map_fragment(ToneMapOperator::Aces);
        assert!(aces.contains("2.51 * x"));
        assert!(aces.contains("fn tonemap"));
        assert!(aces.contains("fn fs_main"));
        let reinhard = build_tone_map_fragment(ToneMapOperator::Reinhard);
        assert!(reinhard.contains("uni.u_white * uni.u_white"));
        let agx = build_tone_map_fragment(ToneMapOperator::Agx);
        assert!(agx.contains("pow(v, vec3f(0.8))"));
    }

    #[test]
    fn tone_map_pipeline_key_is_distinct_per_operator() {
        assert_eq!(tone_map_pipeline_key(ToneMapOperator::Aces), "toneMap.aces");
        assert_eq!(
            tone_map_pipeline_key(ToneMapOperator::Uncharted2),
            "toneMap.uncharted2"
        );
        assert_ne!(
            tone_map_pipeline_key(ToneMapOperator::Filmic),
            tone_map_pipeline_key(ToneMapOperator::Agx)
        );
    }

    #[test]
    fn apply_bloom_effect_to_wgpu_composite_reads_two_sources() {
        let module = build_wgpu_effect_module_wgsl(BLOOM_COMPOSITE_FRAGMENT_WGSL);
        assert!(module.contains("@group(1) @binding(0) var tex0"));
        assert!(module.contains("@group(2) @binding(0) var tex1"));
        assert!(module.contains("u_intensity"));
    }
}
