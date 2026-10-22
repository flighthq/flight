// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: blur passes take host-supplied wgpu targets
//! Iterative separable box blur shared by the glow and shadow recipes (TS `wgpuEffectBoxBlur.ts`).

use flight_effects::compute_box_blur_pass_radius;
use flight_render_wgpu::{WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::{create_wgpu_effect_pipeline, draw_wgpu_effect_pass};
use crate::wgpu_effect_runtime::get_wgpu_effect_module_pipeline;

// Uniforms layout:
//   offset  0: texelSize (vec2f)
//   offset  8: direction (vec2f)
//   offset 16: edgeColor (vec4f)
//   offset 32: radius (f32)
//   offset 36: useEdgeColor (f32)
//   offset 40-47: padding
const BOX_BLUR_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  direction : vec2f,
  edgeColor : vec4f,
  radius : f32,
  useEdgeColor : f32,
  _pad0 : f32, _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sampleBlur(uv : vec2f) -> vec4f {
  if (uni.useEdgeColor > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) {
    return uni.edgeColor;
  }
  return textureSampleLevel(tex, smp, uv, 0.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = i32(uni.radius);
  if (r == 0) { return sampleBlur(uv); }
  var sum = vec4f(0.0);
  let count = f32(2 * r + 1);
  for (var i = -r; i <= r; i++) {
    sum += sampleBlur(uv + f32(i) * uni.texelSize * uni.direction);
  }
  return sum / count;
}"#;

fn apply_box_blur_pass(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
    edge_color: Option<[f32; 4]>,
) {
    let pipeline = get_wgpu_effect_module_pipeline(state, "boxBlur", |state| {
        return create_wgpu_effect_pipeline(
            state,
            BOX_BLUR_WGSL,
            Some(WgpuEffectBlendMode::Replace),
        );
    });
    let width = source.width as f32;
    let height = source.height as f32;
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = 1.0 / width;
            f32[1] = 1.0 / height;
            f32[2] = dir_x;
            f32[3] = dir_y;
            match edge_color {
                None => {
                    f32[4] = 0.0;
                    f32[5] = 0.0;
                    f32[6] = 0.0;
                    f32[7] = 0.0;
                    f32[9] = 0.0;
                }
                Some(edge_color) => {
                    f32[4] = edge_color[0];
                    f32[5] = edge_color[1];
                    f32[6] = edge_color[2];
                    f32[7] = edge_color[3];
                    f32[9] = 1.0;
                }
            }
            f32[8] = radius;
        },
    );
}

/// Applies a separable box blur to `source`, writing `dest` (TS `applyWgpuEffectBoxBlur`).
/// `blur_x` / `blur_y` are the target Gaussian standard deviations (default 4); `passes` is the
/// number of box passes per axis (more passes converge on a Gaussian). `temp` is a caller-provided
/// ping-pong scratch target distinct from both `source` and `dest`.
pub fn apply_wgpu_effect_box_blur(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    temp: &WgpuTextureRenderTarget,
    options: &WgpuEffectBoxBlurOptions,
) {
    let passes = 1.0_f32.max((options.passes.unwrap_or(1.0) + 0.5).floor());
    let blur_x = options.blur_x.unwrap_or(4.0);
    let blur_y = options.blur_y.unwrap_or(4.0);
    let edge_color = options.edge_color;

    let mut read: &WgpuTextureRenderTarget = source;
    let mut write: &WgpuTextureRenderTarget = temp;
    let mut pass = 0.0;
    while pass < passes {
        let radius_x = compute_box_blur_pass_radius(blur_x, passes, pass);
        if radius_x > 0.0 {
            apply_box_blur_pass(state, read, write, radius_x, 1.0, 0.0, edge_color);
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
        let radius_y = compute_box_blur_pass_radius(blur_y, passes, pass);
        if radius_y > 0.0 {
            apply_box_blur_pass(state, read, write, radius_y, 0.0, 1.0, edge_color);
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
        pass += 1.0;
    }

    if !std::ptr::eq(read, dest) {
        apply_box_blur_pass(state, read, dest, 0.0, 0.0, 0.0, None);
    }
}
