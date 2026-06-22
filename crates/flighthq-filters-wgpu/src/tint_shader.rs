//! Tint, invert-tint, blit, blit-offset, and inner-clip WGSL shaders.
//!
//! These are the reusable building blocks for most bitmap filter effects.
//! Pipelines are lazily compiled into the caller-owned `WgpuFilterState` on first
//! use and reused thereafter.
//!
//! Note on Y-axis convention: wgpu UV y=0 is the texture top (screen top), so the
//! blit-offset Y component is negated compared to the WebGL path.

use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::filter_pass::{
    WgpuBlendMode, WgpuDualSourcePipeline, WgpuFilterPipeline, WgpuFilterState,
    create_wgpu_dual_source_pipeline, create_wgpu_filter_pipeline, draw_wgpu_dual_source_pass,
    draw_wgpu_filter_pass,
};

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

// Blits a texture at a UV offset. Out-of-bounds samples produce transparent output.
const BLIT_OFFSET_WGSL: &str = r#"
struct Uniforms {
  offset : vec2f,
  _pad : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let shifted = uv + uni.offset;
  if (shifted.x < 0.0 || shifted.x > 1.0 || shifted.y < 0.0 || shifted.y > 1.0) {
    return vec4f(0.0);
  }
  return textureSampleLevel(tex, smp, shifted, 0.0);
}"#;

// Pass-through blit. Minimal uniform struct required by the pipeline layout.
const BLIT_WGSL: &str = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

// Inner-clip dual-source pipeline: clips group-1 glow to group-2 source alpha.
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

// ---------------------------------------------------------------------------
// Public pass functions
// ---------------------------------------------------------------------------

/// Blits `source` into `dest` at pixel offset `(dx, dy)` (screen-space Y-down).
/// Pixels that sample outside the source bounds produce transparent output.
///
/// The Y component of the offset is negated versus the WebGL implementation
/// because wgpu texture UV y=0 is top (matching screen Y-down), whereas WebGL
/// UV y=0 is bottom.
pub fn apply_wgpu_blit_offset_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    dx: f32,
    dy: f32,
) {
    let (sw, sh) = (source.width as f32, source.height as f32);
    let mut pipeline = take_blit_offset_shader(state, filter_state);
    draw_wgpu_filter_pass(
        state,
        filter_state,
        source,
        Some(dest),
        &mut pipeline,
        |u| {
            u.set_f32(0, -dx / sw);
            u.set_f32(1, -dy / sh);
        },
    );
    filter_state.blit_offset_pipeline = Some(pipeline);
}

/// Blits `source` directly into `dest` without modification.
pub fn apply_wgpu_blit_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
) {
    let mut pipeline = take_blit_shader(state, filter_state);
    draw_wgpu_filter_pass(
        state,
        filter_state,
        source,
        Some(dest),
        &mut pipeline,
        |_| {},
    );
    filter_state.blit_pipeline = Some(pipeline);
}

/// Clips `glow` against `source` alpha: output = glow × source.a.
/// Used by inner glow and inner shadow to confine the effect inside the shape.
pub fn apply_wgpu_inner_clip_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    glow: &WgpuRenderTarget,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
) {
    let mut pipeline = take_inner_clip_shader(state, filter_state);
    draw_wgpu_dual_source_pass(
        state,
        filter_state,
        glow,
        source,
        Some(dest),
        &mut pipeline,
        |_| {},
    );
    filter_state.inner_clip_pipeline = Some(pipeline);
}

/// Tints the INVERTED source alpha with `color`, outputting a premultiplied mask.
/// Used as the first pass for inner glow and inner shadow.
pub fn apply_wgpu_invert_tint_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let (r, g, b) = unpack_color(color);
    let mut pipeline = take_invert_tint_shader(state, filter_state);
    draw_wgpu_filter_pass(
        state,
        filter_state,
        source,
        Some(dest),
        &mut pipeline,
        |u| {
            u.set_f32(0, r);
            u.set_f32(1, g);
            u.set_f32(2, b);
            u.set_f32(3, alpha);
            u.set_f32(4, strength);
        },
    );
    filter_state.invert_tint_pipeline = Some(pipeline);
}

/// Tints the source alpha with `color`, outputting a premultiplied mask into `dest`.
pub fn apply_wgpu_tint_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    color: u32,
    alpha: f32,
    strength: f32,
) {
    let (r, g, b) = unpack_color(color);
    let mut pipeline = take_tint_shader(state, filter_state);
    draw_wgpu_filter_pass(
        state,
        filter_state,
        source,
        Some(dest),
        &mut pipeline,
        |u| {
            u.set_f32(0, r);
            u.set_f32(1, g);
            u.set_f32(2, b);
            u.set_f32(3, alpha);
            u.set_f32(4, strength);
        },
    );
    filter_state.tint_pipeline = Some(pipeline);
}

// ---------------------------------------------------------------------------
// Shader accessors
// ---------------------------------------------------------------------------

/// Returns a mutable reference to the blit-offset pipeline, compiling on first use.
pub fn get_wgpu_blit_offset_shader<'a>(
    state: &WgpuRenderState,
    filter_state: &'a mut WgpuFilterState,
) -> &'a mut WgpuFilterPipeline {
    if filter_state.blit_offset_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(
            state,
            filter_state,
            BLIT_OFFSET_WGSL,
            WgpuBlendMode::Premul,
        );
        filter_state.blit_offset_pipeline = Some(p);
    }
    filter_state.blit_offset_pipeline.as_mut().unwrap()
}

/// Returns a mutable reference to the plain blit pipeline, compiling on first use.
pub fn get_wgpu_blit_shader<'a>(
    state: &WgpuRenderState,
    filter_state: &'a mut WgpuFilterState,
) -> &'a mut WgpuFilterPipeline {
    if filter_state.blit_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(state, filter_state, BLIT_WGSL, WgpuBlendMode::Premul);
        filter_state.blit_pipeline = Some(p);
    }
    filter_state.blit_pipeline.as_mut().unwrap()
}

/// Returns a mutable reference to the inner-clip pipeline, compiling on first use.
pub fn get_wgpu_inner_clip_shader<'a>(
    state: &WgpuRenderState,
    filter_state: &'a mut WgpuFilterState,
) -> &'a mut WgpuDualSourcePipeline {
    if filter_state.inner_clip_pipeline.is_none() {
        let p = create_wgpu_dual_source_pipeline(
            state,
            filter_state,
            INNER_CLIP_WGSL,
            WgpuBlendMode::Premul,
        );
        filter_state.inner_clip_pipeline = Some(p);
    }
    filter_state.inner_clip_pipeline.as_mut().unwrap()
}

/// Returns a mutable reference to the invert-tint pipeline, compiling on first use.
pub fn get_wgpu_invert_tint_shader<'a>(
    state: &WgpuRenderState,
    filter_state: &'a mut WgpuFilterState,
) -> &'a mut WgpuFilterPipeline {
    if filter_state.invert_tint_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(
            state,
            filter_state,
            INVERT_TINT_WGSL,
            WgpuBlendMode::Premul,
        );
        filter_state.invert_tint_pipeline = Some(p);
    }
    filter_state.invert_tint_pipeline.as_mut().unwrap()
}

/// Returns a mutable reference to the tint pipeline, compiling on first use.
pub fn get_wgpu_tint_shader<'a>(
    state: &WgpuRenderState,
    filter_state: &'a mut WgpuFilterState,
) -> &'a mut WgpuFilterPipeline {
    if filter_state.tint_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(state, filter_state, TINT_WGSL, WgpuBlendMode::Premul);
        filter_state.tint_pipeline = Some(p);
    }
    filter_state.tint_pipeline.as_mut().unwrap()
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Unpacks a packed-RGB integer (0xRRGGBB) into straight float channels in [0, 1].
fn unpack_color(color: u32) -> (f32, f32, f32) {
    (
        ((color >> 16) & 0xff) as f32 / 255.0,
        ((color >> 8) & 0xff) as f32 / 255.0,
        (color & 0xff) as f32 / 255.0,
    )
}

// The take/return helpers below move a lazily-compiled pipeline out of the filter state so it can
// be passed to a draw call alongside the `&mut WgpuFilterState` (a pipeline that is itself a field
// of the filter state cannot be borrowed at the same time). Each `apply_*` puts the pipeline back.

fn take_blit_offset_shader(
    state: &WgpuRenderState,
    filter_state: &mut WgpuFilterState,
) -> WgpuFilterPipeline {
    get_wgpu_blit_offset_shader(state, filter_state);
    filter_state.blit_offset_pipeline.take().unwrap()
}

fn take_blit_shader(
    state: &WgpuRenderState,
    filter_state: &mut WgpuFilterState,
) -> WgpuFilterPipeline {
    get_wgpu_blit_shader(state, filter_state);
    filter_state.blit_pipeline.take().unwrap()
}

fn take_inner_clip_shader(
    state: &WgpuRenderState,
    filter_state: &mut WgpuFilterState,
) -> WgpuDualSourcePipeline {
    get_wgpu_inner_clip_shader(state, filter_state);
    filter_state.inner_clip_pipeline.take().unwrap()
}

fn take_invert_tint_shader(
    state: &WgpuRenderState,
    filter_state: &mut WgpuFilterState,
) -> WgpuFilterPipeline {
    get_wgpu_invert_tint_shader(state, filter_state);
    filter_state.invert_tint_pipeline.take().unwrap()
}

fn take_tint_shader(
    state: &WgpuRenderState,
    filter_state: &mut WgpuFilterState,
) -> WgpuFilterPipeline {
    get_wgpu_tint_shader(state, filter_state);
    filter_state.tint_pipeline.take().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    // BLIT_WGSL / shader sources

    #[test]
    fn blit_wgsl_declares_fragment_entry_and_texture_binding() {
        assert!(BLIT_WGSL.contains("fn fs_main"));
        assert!(BLIT_WGSL.contains("@group(1) @binding(0) var tex : texture_2d<f32>"));
    }

    #[test]
    fn inner_clip_wgsl_multiplies_glow_by_source_alpha() {
        assert!(INNER_CLIP_WGSL.contains("@group(2) @binding(0) var texSrc"));
        assert!(INNER_CLIP_WGSL.contains("glow * srcAlpha"));
    }

    #[test]
    fn invert_tint_wgsl_inverts_source_alpha() {
        assert!(INVERT_TINT_WGSL.contains("1.0 - textureSampleLevel(tex, smp, uv, 0.0).a"));
    }

    #[test]
    fn tint_wgsl_outputs_premultiplied_color() {
        assert!(TINT_WGSL.contains("uni.colorAlpha.xyz * a"));
    }

    // unpack_color

    #[test]
    fn unpack_color_splits_red_green_blue() {
        let (r, g, b) = unpack_color(0x4080c0);
        assert!((r - 0x40 as f32 / 255.0).abs() < 1e-6);
        assert!((g - 0x80 as f32 / 255.0).abs() < 1e-6);
        assert!((b - 0xc0 as f32 / 255.0).abs() < 1e-6);
    }

    #[test]
    fn unpack_color_black_is_zero() {
        let (r, g, b) = unpack_color(0x000000);
        assert_eq!((r, g, b), (0.0, 0.0, 0.0));
    }
}
