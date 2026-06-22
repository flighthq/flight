//! Displacement-map wgpu filter pass.

use flighthq_filters::DisplacementMapFilter;
use flighthq_filters::DisplacementMapMode;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, create_wgpu_dual_source_pipeline, draw_wgpu_dual_source_pass,
};

// Samples the map (group 2) to compute per-pixel UV displacement, then samples
// the source (group 1) at the displaced coordinate. Map value 0.5 is neutral.
//
// scaleY is negated versus the WebGL implementation because wgpu UV y=0 is the
// top of the texture (matches screen Y-down), while WebGL UV y=0 is the bottom.
//
// Uniforms layout (48 bytes):
//   texelSize (vec2f), scaleX (f32), scaleY (f32),
//   componentX (i32), componentY (i32), mode (i32), _pad (i32), edgeColor (vec4f)
const DISPLACEMENT_MAP_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  scaleX : f32,
  scaleY : f32,
  componentX : i32,
  componentY : i32,
  mode : i32,
  _pad : i32,
  edgeColor : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var texSrc : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var texMap : texture_2d<f32>;
@group(2) @binding(1) var smp2 : sampler;

fn getChannel(color : vec4f, comp : i32) -> f32 {
  if (comp == 0) { return color.r; }
  if (comp == 1) { return color.g; }
  if (comp == 2) { return color.b; }
  return color.a;
}

fn sampleSource(uv : vec2f) -> vec4f {
  if (uni.mode == 0) { return textureSampleLevel(texSrc, smp, fract(uv), 0.0); }
  if (uni.mode == 1) { return textureSampleLevel(texSrc, smp, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0); }
  if (uni.mode == 2) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0); }
    return textureSampleLevel(texSrc, smp, uv, 0.0);
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return uni.edgeColor; }
  return textureSampleLevel(texSrc, smp, uv, 0.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let mapSample = textureSampleLevel(texMap, smp2, uv, 0.0);
  let mx = getChannel(mapSample, uni.componentX);
  let my = getChannel(mapSample, uni.componentY);
  let offset = vec2f((mx - 0.5) * uni.scaleX, (my - 0.5) * uni.scaleY) * uni.texelSize;
  return sampleSource(uv + offset);
}"#;

/// Applies a displacement map warp to `source`, writing to `dest`.
///
/// `map` supplies the per-pixel displacement vectors; channels are selected by
/// `filter.component_x` and `filter.component_y` (0=R, 1=G, 2=B, 3=A). A single
/// GPU pass — no scratch targets needed.
///
/// The Y displacement is internally negated versus the WebGL implementation to
/// account for wgpu's top-left UV origin.
pub fn apply_displacement_map_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    map: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    filter: &DisplacementMapFilter,
) {
    let mode = mode_index(filter.mode.unwrap_or(DisplacementMapMode::Wrap));
    let edge_color = filter.color.unwrap_or(0);
    let edge_alpha = filter.alpha.unwrap_or(0.0);
    let scale_x = filter.scale_x.unwrap_or(0.0);
    let scale_y = filter.scale_y.unwrap_or(0.0);
    let component_x = filter.component_x.unwrap_or(0) as i32;
    let component_y = filter.component_y.unwrap_or(1) as i32;
    let (sw, sh) = (source.width as f32, source.height as f32);

    if filter_state.displacement_map_pipeline.is_none() {
        let p = create_wgpu_dual_source_pipeline(
            state,
            filter_state,
            DISPLACEMENT_MAP_WGSL,
            WgpuBlendMode::Replace,
        );
        filter_state.displacement_map_pipeline = Some(p);
    }
    let mut pipeline = filter_state.displacement_map_pipeline.take().unwrap();
    draw_wgpu_dual_source_pass(
        state,
        filter_state,
        source,
        map,
        Some(dest),
        &mut pipeline,
        |u| {
            u.set_f32(0, 1.0 / sw);
            u.set_f32(1, 1.0 / sh);
            u.set_f32(2, scale_x);
            // Negate Y scale: wgpu UV y=0 is top (Y-down matches screen), WebGL UV y=0 is bottom.
            u.set_f32(3, -scale_y);
            u.set_i32(4, component_x);
            u.set_i32(5, component_y);
            u.set_i32(6, mode);
            // element 7 is padding
            u.set_f32(8, ((edge_color >> 16) & 0xff) as f32 / 255.0);
            u.set_f32(9, ((edge_color >> 8) & 0xff) as f32 / 255.0);
            u.set_f32(10, (edge_color & 0xff) as f32 / 255.0);
            u.set_f32(11, edge_alpha);
        },
    );
    filter_state.displacement_map_pipeline = Some(pipeline);
}

// Maps the displacement mode to the shader's integer code: wrap=0, clamp=1, ignore=2, color=3.
fn mode_index(mode: DisplacementMapMode) -> i32 {
    match mode {
        DisplacementMapMode::Wrap => 0,
        DisplacementMapMode::Clamp => 1,
        DisplacementMapMode::Ignore => 2,
        DisplacementMapMode::Color => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // DISPLACEMENT_MAP_WGSL

    #[test]
    fn displacement_map_wgsl_binds_source_and_map_groups() {
        assert!(DISPLACEMENT_MAP_WGSL.contains("@group(1) @binding(0) var texSrc"));
        assert!(DISPLACEMENT_MAP_WGSL.contains("@group(2) @binding(0) var texMap"));
    }

    #[test]
    fn displacement_map_wgsl_centers_map_value_on_half() {
        assert!(DISPLACEMENT_MAP_WGSL.contains("(mx - 0.5) * uni.scaleX"));
        assert!(DISPLACEMENT_MAP_WGSL.contains("(my - 0.5) * uni.scaleY"));
    }

    // mode_index

    #[test]
    fn mode_index_matches_shader_codes() {
        assert_eq!(mode_index(DisplacementMapMode::Wrap), 0);
        assert_eq!(mode_index(DisplacementMapMode::Clamp), 1);
        assert_eq!(mode_index(DisplacementMapMode::Ignore), 2);
        assert_eq!(mode_index(DisplacementMapMode::Color), 3);
    }
}
