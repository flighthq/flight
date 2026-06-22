//! Pixelate wgpu filter pass.
//!
//! Averages each block of `filter.block_size` pixels into a single flat color.
//! A single GPU pass — no scratch targets needed.

use flighthq_filters::PixelateFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, create_wgpu_filter_pipeline, draw_wgpu_filter_pass,
};

// Uniforms layout (16 bytes): blockTexelSize (vec2f), _pad (vec2f).
const PIXELATE_WGSL: &str = r#"
struct Uniforms {
  blockTexelSize : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let block = floor(uv / uni.blockTexelSize) * uni.blockTexelSize;
  let center = clamp(block + uni.blockTexelSize * 0.5, vec2f(0.0), vec2f(1.0));
  return textureSampleLevel(tex, smp, center, 0.0);
}"#;

/// Pixelates `source` into `dest` by snapping each block of `block_size` pixels
/// to its center sample. A single GPU pass — no scratch targets needed.
pub fn apply_pixelate_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    filter: &PixelateFilter,
) {
    let block_size = filter.block_size.unwrap_or(8.0).max(1.0);
    let (sw, sh) = (source.width as f32, source.height as f32);

    if filter_state.pixelate_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(state, filter_state, PIXELATE_WGSL, WgpuBlendMode::Replace);
        filter_state.pixelate_pipeline = Some(p);
    }
    let mut pipeline = filter_state.pixelate_pipeline.take().unwrap();
    draw_wgpu_filter_pass(state, filter_state, source, Some(dest), &mut pipeline, |u| {
        u.set_f32(0, block_size / sw);
        u.set_f32(1, block_size / sh);
    });
    filter_state.pixelate_pipeline = Some(pipeline);
}

#[cfg(test)]
mod tests {
    use super::*;

    // PIXELATE_WGSL

    #[test]
    fn pixelate_wgsl_snaps_to_block_center() {
        assert!(PIXELATE_WGSL.contains("floor(uv / uni.blockTexelSize) * uni.blockTexelSize"));
        assert!(PIXELATE_WGSL.contains("block + uni.blockTexelSize * 0.5"));
    }
}
