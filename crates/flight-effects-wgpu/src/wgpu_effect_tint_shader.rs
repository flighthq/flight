// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: tint passes take host-supplied wgpu targets
//! Alpha-mask tint passes shared by the glow and shadow recipes (TS `wgpuEffectTintShader.ts`).

use flight_color::unpack_color_rgba;
use flight_render_wgpu::{WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::{
    create_wgpu_dual_source_effect_pipeline, create_wgpu_effect_pipeline,
    draw_wgpu_dual_source_effect_pass, draw_wgpu_effect_pass,
};
use crate::wgpu_effect_runtime::get_wgpu_effect_module_pipeline;

// Extracts the source alpha, tints it with a solid color, outputs premultiplied RGBA.
const TINT_WGSL: &str = r#"
struct Uniforms {
  colorAlpha : vec4f,
  strength : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let a = min(1.0, textureSampleLevel(tex, smp, uv, 0.0).a * uni.colorAlpha.w * uni.strength);
  return vec4f(uni.colorAlpha.xyz * a, a);
}"#;

// Extracts the INVERTED source alpha, tints it. Used for inner glow/shadow.
const INVERT_TINT_WGSL: &str = r#"
struct Uniforms {
  colorAlpha : vec4f,
  strength : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let a = min(1.0, (1.0 - textureSampleLevel(tex, smp, uv, 0.0).a) * uni.colorAlpha.w * uni.strength);
  return vec4f(uni.colorAlpha.xyz * a, a);
}"#;

// Inner-clip dual-source pipeline: clips unit-1 glow to unit-2 source alpha.
// Used by inner glow and inner shadow.
const INNER_CLIP_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texGlow : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texSrc : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let glow = textureSampleLevel(texGlow, smp, uv, 0.0);
  let srcAlpha = textureSampleLevel(texSrc, smp2, uv, 0.0).a;
  return glow * srcAlpha;
}"#;

/// Clips `glow` against the source alpha: output = glow x source.a (TS
/// `applyWgpuEffectInnerClipPass`).
pub fn apply_wgpu_effect_inner_clip_pass(
    state: &mut WgpuRenderState,
    glow: &WgpuTextureRenderTarget,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
) {
    let pipeline = get_wgpu_effect_module_pipeline(state, "tint.innerClip", |state| {
        return create_wgpu_dual_source_effect_pipeline(
            state,
            INNER_CLIP_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
    draw_wgpu_dual_source_effect_pass(
        state,
        glow,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |_, _| {},
    );
}

/// Tints the INVERTED source alpha with `color` (packed RGBA) and outputs a premultiplied mask; used
/// for inner effects (TS `applyWgpuEffectInvertTintPass`).
pub fn apply_wgpu_effect_invert_tint_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let pipeline = get_wgpu_effect_module_pipeline(state, "tint.invert", |state| {
        return create_wgpu_effect_pipeline(
            state,
            INVERT_TINT_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
    draw_tint(state, source, dest, &pipeline, color, alpha, strength);
}

/// Tints the source alpha with `color` (packed RGBA) and outputs a premultiplied mask into `dest`
/// (TS `applyWgpuEffectTintPass`).
pub fn apply_wgpu_effect_tint_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let pipeline = get_wgpu_effect_module_pipeline(state, "tint", |state| {
        return create_wgpu_effect_pipeline(state, TINT_WGSL, Some(WgpuEffectBlendMode::Replace));
    });
    draw_tint(state, source, dest, &pipeline, color, alpha, strength);
}

fn draw_tint(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    pipeline: &flight_entity::Ref<WgpuEffectPipeline>,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let mut tint = [0.0_f32; 4];
    unpack_color_rgba(&mut tint, color);
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = tint[0];
            f32[1] = tint[1];
            f32[2] = tint[2];
            f32[3] = alpha * tint[3];
            f32[4] = strength;
        },
    );
}
