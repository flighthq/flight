//! Gradient-bevel wgpu filter pass.
//!
//! The gradient maps bevel depth (shadow edge → highlight edge) to colors.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates a temporary gradient ramp texture internally on each
//! call; it is destroyed before the function returns.

use flighthq_filters::BevelType;
use flighthq_filters::GradientBevelFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, clear_wgpu_filter_target, create_wgpu_filter_pipeline,
    create_wgpu_triple_source_pipeline, draw_wgpu_views_pass,
};
use crate::gradient_ramp::create_wgpu_gradient_ramp_texture;
use crate::tint_shader::{apply_wgpu_blit_pass, apply_wgpu_tint_pass};

// Samples the blurred alpha at -offset (high) and +offset (low) to compute a bevel value in
// [-1, 1], mapped to [0, 1] for gradient lookup. Output in the red channel; alpha=1.
//
// The Y offset component is negated by the caller versus the WebGL implementation so the bevel
// direction matches across backends (wgpu UV y=0 is top-left).
//
// Uniforms layout (16 bytes): offset (vec2f), _pad (vec2f).
const BEVEL_ENCODE_WGSL: &str = r#"
struct Uniforms {
  offset : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let high = textureSampleLevel(tex, smp, uv - uni.offset, 0.0).a;
  let low  = textureSampleLevel(tex, smp, uv + uni.offset, 0.0).a;
  let bevelVal = clamp((high - low) * 0.5 + 0.5, 0.0, 1.0);
  return vec4f(bevelVal, 0.0, 0.0, 1.0);
}"#;

// Looks up the encoded bevel value (in .r) in the gradient ramp (group 2) and clips the result to
// the source alpha (group 3).
const BEVEL_APPLY_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texEncoded : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texRamp : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;
@group(3) @binding(0) var texSource : texture_2d<f32>;
@group(3) @binding(1) var smp3 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let bevelVal = textureSampleLevel(texEncoded, smp, uv, 0.0).r;
  let color = textureSampleLevel(texRamp, smp2, vec2f(bevelVal, 0.5), 0.0);
  let srcAlpha = textureSampleLevel(texSource, smp3, uv, 0.0).a;
  return color * srcAlpha;
}"#;

/// Applies a gradient bevel to `source`, writing the result to `dest`.
///
/// `scratch` must contain three render targets of the same dimensions as `dest`.
///
/// The Y bevel offset is negated versus the WebGL implementation to account for
/// wgpu's top-left UV origin.
pub fn apply_gradient_bevel_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 3],
    filter: &GradientBevelFilter,
) {
    let angle = filter.angle.unwrap_or(45.0).to_radians();
    let distance = filter.distance.unwrap_or(4.0);
    let quality = filter.quality.unwrap_or(1).max(1);
    let strength = filter.strength.unwrap_or(1.0);

    let [s0, s1, s2] = *scratch;

    // Build blur basis -> s1.
    apply_wgpu_tint_pass(
        state,
        filter_state,
        source,
        s0,
        0xffffff,
        1.0,
        strength.min(1.0),
    );
    apply_box_blur_filter_to_wgpu(
        state,
        filter_state,
        s0,
        s1,
        s2,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        quality,
    );

    // Encode bevel value from blurred alpha offset samples -> s0.
    let dx = (angle.cos() * distance) / s1.width as f32;
    // Negate Y: wgpu UV y=0 is top (Y-down matches screen), WebGL UV y=0 is bottom.
    let dy = -((angle.sin() * distance) / s1.height as f32);

    if filter_state.gradient_bevel_encode_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(
            state,
            filter_state,
            BEVEL_ENCODE_WGSL,
            WgpuBlendMode::Replace,
        );
        filter_state.gradient_bevel_encode_pipeline = Some(p);
    }
    let mut encode = filter_state.gradient_bevel_encode_pipeline.take().unwrap();
    draw_wgpu_views_pass(
        state,
        filter_state,
        &[&s1.view],
        Some(s0),
        &mut encode,
        |u| {
            u.set_f32(0, dx);
            u.set_f32(1, dy);
        },
    );
    filter_state.gradient_bevel_encode_pipeline = Some(encode);

    // Apply: gradient-ramp lookup from encoded bevel, clipped to source alpha -> s1.
    let ratios: Vec<u8> = filter
        .ratios
        .iter()
        .map(|&r| r.round().clamp(0.0, 255.0) as u8)
        .collect();
    let ramp = create_wgpu_gradient_ramp_texture(state, &filter.colors, &filter.alphas, &ratios);
    let ramp_view = ramp.create_view(&wgpu::TextureViewDescriptor::default());

    if filter_state.gradient_bevel_apply_pipeline.is_none() {
        let p = create_wgpu_triple_source_pipeline(
            state,
            filter_state,
            BEVEL_APPLY_WGSL,
            WgpuBlendMode::Premul,
        );
        filter_state.gradient_bevel_apply_pipeline = Some(p);
    }
    let mut apply = filter_state.gradient_bevel_apply_pipeline.take().unwrap();
    // encoded (group 1) + ramp (group 2) + source (group 3) -> s1.
    draw_wgpu_views_pass(
        state,
        filter_state,
        &[&s0.view, &ramp_view, &source.view],
        Some(s1),
        &mut apply,
        |_| {},
    );
    filter_state.gradient_bevel_apply_pipeline = Some(apply);

    ramp.destroy();

    clear_wgpu_filter_target(state, dest);
    // Full bevel composites the source under the bevel; inner/outer omit the base source.
    let bevel_type = filter.bevel_type.unwrap_or(BevelType::Full);
    if bevel_type == BevelType::Full {
        apply_wgpu_blit_pass(state, filter_state, source, dest);
    }
    apply_wgpu_blit_pass(state, filter_state, s1, dest);
}

#[cfg(test)]
mod tests {
    use super::*;

    // BEVEL_ENCODE_WGSL / BEVEL_APPLY_WGSL

    #[test]
    fn bevel_encode_wgsl_maps_bevel_to_red_channel() {
        assert!(BEVEL_ENCODE_WGSL.contains("(high - low) * 0.5 + 0.5"));
        assert!(BEVEL_ENCODE_WGSL.contains("return vec4f(bevelVal, 0.0, 0.0, 1.0)"));
    }

    #[test]
    fn bevel_apply_wgsl_clips_ramp_to_source_alpha() {
        assert!(BEVEL_APPLY_WGSL.contains("@group(3) @binding(0) var texSource"));
        assert!(BEVEL_APPLY_WGSL.contains("return color * srcAlpha"));
    }
}
