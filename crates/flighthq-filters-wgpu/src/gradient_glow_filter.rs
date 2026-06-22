//! Gradient-glow wgpu filter pass.
//!
//! Compositing order: gradient glow → source on top.
//!
//! `scratch` must contain three render targets of the same dimensions as `dest`.
//! This function allocates a temporary gradient ramp texture internally on each
//! call; it is destroyed before the function returns.

use flighthq_filters::GradientGlowFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, clear_wgpu_filter_target, create_wgpu_dual_source_pipeline,
    draw_wgpu_views_pass,
};
use crate::gradient_ramp::create_wgpu_gradient_ramp_texture;
use crate::tint_shader::{apply_wgpu_blit_pass, apply_wgpu_tint_pass};

// Uses the blurred alpha (group 1) to index into a gradient ramp texture (group 2).
const GRADIENT_LOOKUP_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texBlurred : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texRamp : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let alpha = textureSampleLevel(texBlurred, smp, uv, 0.0).a;
  return textureSampleLevel(texRamp, smp2, vec2f(alpha, 0.5), 0.0);
}"#;

/// Applies a gradient glow to `source`, writing the result to `dest`.
///
/// The gradient ramp is built each call from `filter.colors`, `filter.alphas`,
/// and `filter.ratios`. Compositing order: gradient glow → source on top.
///
/// `scratch` must contain three render targets of the same dimensions as `dest`.
pub fn apply_gradient_glow_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 3],
    filter: &GradientGlowFilter,
) {
    let quality = filter.quality.unwrap_or(1).max(1);
    let strength = filter.strength.unwrap_or(1.0);

    let [s0, s1, s2] = *scratch;

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
        filter.blur_x.unwrap_or(6.0),
        filter.blur_y.unwrap_or(6.0),
        quality,
    );

    let ratios: Vec<u8> = filter
        .ratios
        .iter()
        .map(|&r| r.round().clamp(0.0, 255.0) as u8)
        .collect();
    let ramp = create_wgpu_gradient_ramp_texture(state, &filter.colors, &filter.alphas, &ratios);
    let ramp_view = ramp.create_view(&wgpu::TextureViewDescriptor::default());

    if filter_state.gradient_lookup_pipeline.is_none() {
        let p = create_wgpu_dual_source_pipeline(
            state,
            filter_state,
            GRADIENT_LOOKUP_WGSL,
            WgpuBlendMode::Premul,
        );
        filter_state.gradient_lookup_pipeline = Some(p);
    }
    let mut pipeline = filter_state.gradient_lookup_pipeline.take().unwrap();
    // blurred alpha (group 1) + gradient ramp (group 2) -> gradient glow into s0.
    draw_wgpu_views_pass(
        state,
        filter_state,
        &[&s1.view, &ramp_view],
        Some(s0),
        &mut pipeline,
        |_| {},
    );
    filter_state.gradient_lookup_pipeline = Some(pipeline);

    // Destroy before submit (deferred by wgpu until the encoder's work completes).
    ramp.destroy();

    clear_wgpu_filter_target(state, dest);
    apply_wgpu_blit_pass(state, filter_state, s0, dest);
    apply_wgpu_blit_pass(state, filter_state, source, dest);
}

#[cfg(test)]
mod tests {
    use super::*;

    // GRADIENT_LOOKUP_WGSL

    #[test]
    fn gradient_lookup_wgsl_indexes_ramp_by_blurred_alpha() {
        assert!(
            GRADIENT_LOOKUP_WGSL
                .contains("let alpha = textureSampleLevel(texBlurred, smp, uv, 0.0).a")
        );
        assert!(
            GRADIENT_LOOKUP_WGSL
                .contains("textureSampleLevel(texRamp, smp2, vec2f(alpha, 0.5), 0.0)")
        );
    }
}
