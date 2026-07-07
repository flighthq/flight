//! Box-blur and Gaussian-blur wgpu filter passes.

use flighthq_filters::BlurFilter;
use flighthq_filters_math::compute_box_blur_pass_radius;
use flighthq_render_wgpu::{WgpuRenderState, WgpuRenderTarget};

use crate::filter_pass::{
    WgpuBlendMode, WgpuFilterState, create_wgpu_filter_pipeline, draw_wgpu_filter_pass,
};
use crate::tint_shader::apply_wgpu_blit_pass;

// Uniforms layout (shared by box and Gaussian):
//   offset  0: texelSize (vec2f)
//   offset  8: direction (vec2f)
//   offset 16: radius (f32)
//   offset 20: sigma (f32)  [Gaussian only; unused for box]
const BOX_BLUR_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  direction : vec2f,
  radius : f32,
  _pad0 : f32, _pad1 : f32, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = i32(uni.radius);
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  var sum = vec4f(0.0);
  let count = f32(2 * r + 1);
  for (var i = -r; i <= r; i++) {
    sum += textureSampleLevel(tex, smp, uv + f32(i) * uni.texelSize * uni.direction, 0.0);
  }
  return sum / count;
}"#;

const GAUSSIAN_BLUR_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  direction : vec2f,
  radius : f32,
  sigma : f32,
  _pad0 : f32, _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = i32(uni.radius);
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  let twoSigmaSq = 2.0 * uni.sigma * uni.sigma;
  var sum = vec4f(0.0);
  var weightSum = 0.0;
  for (var i = -r; i <= r; i++) {
    let w = exp(-f32(i * i) / twoSigmaSq);
    sum += w * textureSampleLevel(tex, smp, uv + f32(i) * uni.texelSize * uni.direction, 0.0);
    weightSum += w;
  }
  return sum / weightSum;
}"#;

/// Applies a `BlurFilter` descriptor to `source`, writing to `dest`.
///
/// Selects the Gaussian path — a faithful, sigma-exact blur matching the CSS
/// and surface references — as the default. `temp` is a ping-pong scratch
/// target distinct from both `source` and `dest`. Use
/// `apply_box_blur_filter_to_wgpu` directly when the cheaper multi-pass box
/// approximation is preferred (e.g. for soft spreads in glow and shadow
/// effects). Absent `blur_x` / `blur_y` default to 4.0.
pub fn apply_blur_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    temp: &WgpuRenderTarget,
    filter: &BlurFilter,
) {
    apply_gaussian_blur_filter_to_wgpu(
        state,
        filter_state,
        source,
        dest,
        temp,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
    );
}

/// Applies a separable box blur to `source`, writing to `dest`.
///
/// `blur_x` / `blur_y` are the target Gaussian standard deviations; `passes`
/// controls how many box passes per axis are used (more passes → closer to
/// Gaussian shape; see `compute_box_blur_pass_radius`). `temp` is a
/// caller-provided ping-pong scratch target distinct from both `source` and
/// `dest`.
pub fn apply_box_blur_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    temp: &WgpuRenderTarget,
    blur_x: f32,
    blur_y: f32,
    passes: u32,
) {
    let passes = passes.max(1);

    // The ping-pong walks between source, temp, and dest. References are tracked by identity so the
    // final blit only runs when the last write did not already land in `dest`.
    let mut read: &WgpuRenderTarget = source;
    let mut write: &WgpuRenderTarget = temp;

    for pass in 0..passes {
        let radius_x = compute_box_blur_pass_radius(blur_x as f64, passes, pass);
        if radius_x > 0.0 {
            apply_box_blur_pass(state, filter_state, read, write, radius_x as f32, 1.0, 0.0);
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
        let radius_y = compute_box_blur_pass_radius(blur_y as f64, passes, pass);
        if radius_y > 0.0 {
            apply_box_blur_pass(state, filter_state, read, write, radius_y as f32, 0.0, 1.0);
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
    }

    if !std::ptr::eq(read, dest) {
        apply_wgpu_blit_pass(state, filter_state, read, dest);
    }
}

/// Applies a faithful separable Gaussian blur to `source`, writing to `dest`.
///
/// `blur_x` / `blur_y` are Gaussian standard deviations (matching CSS
/// `blur(Xpx)`). Each axis is a single weighted pass with radius `⌈3σ⌉`.
/// `temp` is a caller-provided ping-pong scratch target distinct from both
/// `source` and `dest`.
pub fn apply_gaussian_blur_filter_to_wgpu(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    temp: &WgpuRenderTarget,
    blur_x: f32,
    blur_y: f32,
) {
    let radius_x = if blur_x > 0.0 {
        (blur_x * 3.0).ceil() as u32
    } else {
        0
    };
    let radius_y = if blur_y > 0.0 {
        (blur_y * 3.0).ceil() as u32
    } else {
        0
    };

    if radius_x == 0 && radius_y == 0 {
        apply_wgpu_blit_pass(state, filter_state, source, dest);
        return;
    }

    let mut read: &WgpuRenderTarget = source;
    let mut write: &WgpuRenderTarget = temp;

    if radius_x > 0 {
        apply_gaussian_blur_pass(
            state,
            filter_state,
            read,
            write,
            blur_x,
            radius_x as f32,
            1.0,
            0.0,
        );
        read = write;
        write = if std::ptr::eq(write, temp) {
            dest
        } else {
            temp
        };
    }
    if radius_y > 0 {
        apply_gaussian_blur_pass(
            state,
            filter_state,
            read,
            write,
            blur_y,
            radius_y as f32,
            0.0,
            1.0,
        );
        read = write;
    }

    if !std::ptr::eq(read, dest) {
        apply_wgpu_blit_pass(state, filter_state, read, dest);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn apply_box_blur_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
) {
    let (sw, sh) = (source.width as f32, source.height as f32);
    if filter_state.box_blur_pipeline.is_none() {
        let p =
            create_wgpu_filter_pipeline(state, filter_state, BOX_BLUR_WGSL, WgpuBlendMode::Replace);
        filter_state.box_blur_pipeline = Some(p);
    }
    let mut pipeline = filter_state.box_blur_pipeline.take().unwrap();
    draw_wgpu_filter_pass(
        state,
        filter_state,
        source,
        Some(dest),
        &mut pipeline,
        |u| {
            u.set_f32(0, 1.0 / sw);
            u.set_f32(1, 1.0 / sh);
            u.set_f32(2, dir_x);
            u.set_f32(3, dir_y);
            u.set_f32(4, radius);
        },
    );
    filter_state.box_blur_pipeline = Some(pipeline);
}

#[allow(clippy::too_many_arguments)]
fn apply_gaussian_blur_pass(
    state: &mut WgpuRenderState,
    filter_state: &mut WgpuFilterState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    sigma: f32,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
) {
    let (sw, sh) = (source.width as f32, source.height as f32);
    if filter_state.gaussian_blur_pipeline.is_none() {
        let p = create_wgpu_filter_pipeline(
            state,
            filter_state,
            GAUSSIAN_BLUR_WGSL,
            WgpuBlendMode::Replace,
        );
        filter_state.gaussian_blur_pipeline = Some(p);
    }
    let mut pipeline = filter_state.gaussian_blur_pipeline.take().unwrap();
    draw_wgpu_filter_pass(
        state,
        filter_state,
        source,
        Some(dest),
        &mut pipeline,
        |u| {
            u.set_f32(0, 1.0 / sw);
            u.set_f32(1, 1.0 / sh);
            u.set_f32(2, dir_x);
            u.set_f32(3, dir_y);
            u.set_f32(4, radius);
            u.set_f32(5, sigma);
        },
    );
    filter_state.gaussian_blur_pipeline = Some(pipeline);
}

#[cfg(test)]
mod tests {
    use super::*;

    // BOX_BLUR_WGSL / GAUSSIAN_BLUR_WGSL

    #[test]
    fn box_blur_wgsl_averages_over_radius() {
        assert!(BOX_BLUR_WGSL.contains("let count = f32(2 * r + 1)"));
        assert!(BOX_BLUR_WGSL.contains("return sum / count"));
    }

    #[test]
    fn gaussian_blur_wgsl_weights_by_exp() {
        assert!(GAUSSIAN_BLUR_WGSL.contains("let twoSigmaSq = 2.0 * uni.sigma * uni.sigma"));
        assert!(GAUSSIAN_BLUR_WGSL.contains("exp(-f32(i * i) / twoSigmaSq)"));
        assert!(GAUSSIAN_BLUR_WGSL.contains("return sum / weightSum"));
    }
}
