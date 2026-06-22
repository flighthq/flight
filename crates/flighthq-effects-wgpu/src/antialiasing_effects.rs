//! WGPU anti-aliasing effect recipes.
//!
//! FXAA: luminance edge detection + directional blend (single-pass reference).
//! SMAA: single-pass edge-aware blur approximation.
//! TAA: passthrough copy placeholder (no history buffer available).
//!
//! Mirrors the TS `antialiasingEffects` from `effects-webgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{FxaaEffect, SmaaEffect, TaaEffect};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_effect_filter_pass, get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{WgpuRenderEffectContext, WgpuRenderEffectRunner};

/// Applies FXAA to `source` and writes the result to `dest`.
pub fn apply_fxaa_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &FxaaEffect,
) {
    let edge_threshold = effect.edge_threshold.unwrap_or(0.0312);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "antialiasing.fxaa",
        FXAA_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "antialiasing.fxaa", source, Some(dest), |f32s, _| {
        f32s[0] = width;
        f32s[1] = height;
        f32s[2] = edge_threshold;
    });
}

/// Applies SMAA (single-pass approximation) to `source` and writes to `dest`.
pub fn apply_smaa_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &SmaaEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.1);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "antialiasing.smaa",
        SMAA_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "antialiasing.smaa", source, Some(dest), |f32s, _| {
        f32s[0] = width;
        f32s[1] = height;
        f32s[2] = threshold;
    });
}

/// Applies TAA (passthrough) to `source` and writes to `dest`.
pub fn apply_taa_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    _effect: &TaaEffect,
) {
    get_wgpu_effect_pipeline(
        state,
        "antialiasing.taa",
        TAA_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "antialiasing.taa", source, Some(dest), |_, _| {});
}

/// Default WGPU runner for [`FxaaEffect`].
pub const DEFAULT_WGPU_FXAA_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Fxaa(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_fxaa_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`SmaaEffect`].
pub const DEFAULT_WGPU_SMAA_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Smaa(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_smaa_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`TaaEffect`].
pub const DEFAULT_WGPU_TAA_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Taa(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_taa_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

// Slots [0..1]=resolution (vec2f), [2]=edgeThreshold; the trailing scalar fits in the same 16-byte block.
const FXAA_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_resolution : vec2f, u_edgeThreshold : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let rgbM = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let rgbNW = textureSampleLevel(tex, smp, uv + vec2f(-1.0, -1.0) * texel, 0.0).rgb;
  let rgbNE = textureSampleLevel(tex, smp, uv + vec2f(1.0, -1.0) * texel, 0.0).rgb;
  let rgbSW = textureSampleLevel(tex, smp, uv + vec2f(-1.0, 1.0) * texel, 0.0).rgb;
  let rgbSE = textureSampleLevel(tex, smp, uv + vec2f(1.0, 1.0) * texel, 0.0).rgb;
  let lumaM = luma(rgbM);
  let lumaNW = luma(rgbNW);
  let lumaNE = luma(rgbNE);
  let lumaSW = luma(rgbSW);
  let lumaSE = luma(rgbSE);
  let lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  let lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  let range = lumaMax - lumaMin;
  if (range < max(uni.u_edgeThreshold, lumaMax * 0.125)) {
    return vec4f(rgbM, textureSampleLevel(tex, smp, uv, 0.0).a);
  }
  var dir : vec2f;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  let dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 0.0078125);
  let rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2f(-8.0), vec2f(8.0)) * texel;
  let rgbA = 0.5 * (
    textureSampleLevel(tex, smp, uv + dir * (1.0 / 3.0 - 0.5), 0.0).rgb +
    textureSampleLevel(tex, smp, uv + dir * (2.0 / 3.0 - 0.5), 0.0).rgb);
  let rgbB = rgbA * 0.5 + 0.25 * (
    textureSampleLevel(tex, smp, uv + dir * -0.5, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + dir * 0.5, 0.0).rgb);
  let lumaB = luma(rgbB);
  let result = select(rgbB, rgbA, lumaB < lumaMin || lumaB > lumaMax);
  return vec4f(result, textureSampleLevel(tex, smp, uv, 0.0).a);
}"#;

// Slots [0..1]=resolution (vec2f), [2]=threshold; the trailing scalar fits in the same 16-byte block.
const SMAA_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { u_resolution : vec2f, u_threshold : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let center = textureSampleLevel(tex, smp, uv, 0.0);
  let lumaC = luma(center.rgb);
  let lumaL = luma(textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb);
  let lumaR = luma(textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb);
  let lumaT = luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb);
  let lumaB = luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb);
  let edge = max(abs(lumaC - lumaL), max(abs(lumaC - lumaR), max(abs(lumaC - lumaT), abs(lumaC - lumaB))));
  if (edge < uni.u_threshold) {
    return center;
  }
  let blurred = (
    textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb +
    textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb +
    center.rgb) / 5.0;
  return vec4f(blurred, center.a);
}"#;

// TAA has no parameters, but the filter pass always binds a uniform buffer at group(0); the struct is
// declared and read (× 1.0) so the binding stays live and the bind-group layout matches.
const TAA_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms { _pad0 : f32, _pad1 : f32, _pad2 : f32, _pad3 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(c.rgb, c.a + uni._pad0 * 0.0);
}"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_program_cache::build_wgpu_effect_module_wgsl;

    #[test]
    fn apply_fxaa_effect_to_wgpu_fragment_declares_uniforms_and_entry() {
        let module = build_wgpu_effect_module_wgsl(FXAA_FRAGMENT_WGSL);
        assert!(module.contains("u_edgeThreshold"));
        assert!(module.contains("fn fs_main"));
        assert!(module.contains("@group(1) @binding(0) var tex"));
    }

    #[test]
    fn apply_smaa_effect_to_wgpu_fragment_declares_threshold() {
        let module = build_wgpu_effect_module_wgsl(SMAA_FRAGMENT_WGSL);
        assert!(module.contains("u_threshold"));
        assert!(module.contains("fn fs_main"));
    }

    #[test]
    fn apply_taa_effect_to_wgpu_fragment_is_passthrough() {
        let module = build_wgpu_effect_module_wgsl(TAA_FRAGMENT_WGSL);
        // Passthrough samples the source and adds a × 0 term to keep the binding live.
        assert!(module.contains("textureSampleLevel(tex, smp, uv, 0.0)"));
        assert!(module.contains("uni._pad0 * 0.0"));
    }
}
