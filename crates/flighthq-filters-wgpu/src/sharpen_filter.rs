//! Sharpen wgpu filter pass.
//!
//! Uses an unsharp mask: `sharpened = source + (source − blurred) × amount`.
//!
//! `scratch` must contain two render targets: one for the blurred image and one
//! for the blur ping-pong temp. This function allocates nothing itself.

use flighthq_filters::SharpenFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::blur_filter::apply_box_blur_filter_to_wgpu;
use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, create_wgpu_dual_source_pipeline, draw_wgpu_dual_source_pass,
};

// Unsharp mask: source0 = original source (group 1), source1 = blurred (group 2).
// Uniforms layout (16 bytes): amount (f32) then padding.
const SHARPEN_WGSL: &str = r#"
struct Uniforms {
  amount : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texSrc : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texBlurred : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let src = textureSampleLevel(texSrc, smp, uv, 0.0);
  let blurred = textureSampleLevel(texBlurred, smp2, uv, 0.0);
  return clamp(src + (src - blurred) * uni.amount, vec4f(0.0), vec4f(1.0));
}"#;

/// Sharpens `source` using an unsharp mask, writing to `dest`.
///
/// `blur_x` / `blur_y` are the mask blur standard deviations; `amount` controls
/// strength. `scratch` must contain two render targets: `[blurred, blur_temp]`.
/// This function allocates nothing itself.
pub fn apply_sharpen_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    scratch: &[&WgpuRenderTarget; 2],
    filter: &SharpenFilter,
) {
    let quality = filter.quality.unwrap_or(1).max(1);
    let amount = filter.amount.unwrap_or(1.0);
    let blur_x = filter.blur_x.unwrap_or(2.0);
    let blur_y = filter.blur_y.unwrap_or(2.0);

    let [blurred, blur_temp] = *scratch;

    apply_box_blur_filter_to_wgpu(state, filter_state, source, blurred, blur_temp, blur_x, blur_y, quality);

    if filter_state.sharpen_pipeline.is_none() {
        let p = create_wgpu_dual_source_pipeline(state, filter_state, SHARPEN_WGSL, WgpuBlendMode::Replace);
        filter_state.sharpen_pipeline = Some(p);
    }
    let mut pipeline = filter_state.sharpen_pipeline.take().unwrap();
    draw_wgpu_dual_source_pass(state, filter_state, source, blurred, Some(dest), &mut pipeline, |u| {
        u.set_f32(0, amount);
    });
    filter_state.sharpen_pipeline = Some(pipeline);
}

#[cfg(test)]
mod tests {
    use super::*;

    // SHARPEN_WGSL

    #[test]
    fn sharpen_wgsl_is_unsharp_mask() {
        assert!(SHARPEN_WGSL.contains("(src - blurred) * uni.amount"));
        assert!(SHARPEN_WGSL.contains("@group(2) @binding(0) var texBlurred"));
    }
}
