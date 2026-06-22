//! Median wgpu filter pass.
//!
//! Preserves edges while removing noise. Supports radius 0–2 (up to 5×5 kernel);
//! use the CPU surface path for larger radii. A single GPU pass — no scratch
//! targets needed.

use flighthq_filters::MedianFilter;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, create_wgpu_filter_pipeline, draw_wgpu_filter_pass,
};

// Supports radius up to 2 (5×5 = 25 samples). Sorts per-channel with insertion sort.
const MAX_RADIUS: i32 = 2;

const MEDIAN_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  radius : i32,
  _pad : i32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sortArr(arr : ptr<function, array<f32, 25>>, n : i32) {
  for (var i = 1; i < n; i++) {
    let key = (*arr)[i];
    var j = i - 1;
    loop {
      if (j < 0 || (*arr)[j] <= key) { break; }
      (*arr)[j + 1] = (*arr)[j];
      j -= 1;
    }
    (*arr)[j + 1] = key;
  }
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = clamp(uni.radius, 0, 2);
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  let n = (2 * r + 1) * (2 * r + 1);
  var rv : array<f32, 25>;
  var gv : array<f32, 25>;
  var bv : array<f32, 25>;
  var av : array<f32, 25>;
  var count = 0;
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      if (abs(dy) <= r && abs(dx) <= r) {
        let s = textureSampleLevel(tex, smp, uv + vec2f(f32(dx), f32(dy)) * uni.texelSize, 0.0);
        rv[count] = s.r;
        gv[count] = s.g;
        bv[count] = s.b;
        av[count] = s.a;
        count += 1;
      }
    }
  }
  sortArr(&rv, n);
  sortArr(&gv, n);
  sortArr(&bv, n);
  sortArr(&av, n);
  let mid = n / 2;
  return vec4f(rv[mid], gv[mid], bv[mid], av[mid]);
}"#;

/// Applies a per-channel median filter to `source`, writing to `dest`.
/// Supports radius 0–2 (up to 5×5); larger radii clamp to 2. A single GPU pass.
pub fn apply_median_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    filter: &MedianFilter,
) {
    let radius = (filter.radius.unwrap_or(1.0).round() as i32).clamp(0, MAX_RADIUS);
    let (sw, sh) = (source.width as f32, source.height as f32);

    if filter_state.median_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(state, filter_state, MEDIAN_WGSL, WgpuBlendMode::Replace);
        filter_state.median_pipeline = Some(p);
    }
    let mut pipeline = filter_state.median_pipeline.take().unwrap();
    draw_wgpu_filter_pass(state, filter_state, source, Some(dest), &mut pipeline, |u| {
        u.set_f32(0, 1.0 / sw);
        u.set_f32(1, 1.0 / sh);
        u.set_i32(2, radius);
    });
    filter_state.median_pipeline = Some(pipeline);
}

#[cfg(test)]
mod tests {
    use super::*;

    // MEDIAN_WGSL

    #[test]
    fn median_wgsl_declares_25_sample_arrays() {
        assert!(MEDIAN_WGSL.contains("var rv : array<f32, 25>"));
        assert!(MEDIAN_WGSL.contains("array<f32, 25>"));
    }

    #[test]
    fn median_wgsl_picks_middle_element() {
        assert!(MEDIAN_WGSL.contains("let mid = n / 2"));
        assert!(MEDIAN_WGSL.contains("return vec4f(rv[mid], gv[mid], bv[mid], av[mid])"));
    }
}
