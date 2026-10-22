// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Generic matrix-kernel convolution (TS `wgpuConvolutionEffect.ts`): each output pixel is the
//! weighted sum of its matrixX x matrixY neighborhood, normalized by `divisor` (defaults to the
//! matrix sum) and offset by `bias`.

use flight_color::unpack_color_rgba;
use flight_effects::{ConvolutionEffect, Effect};
use flight_entity::throw_error;
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

/// Largest kernel the WebGPU path supports, a 7x7 = 49 elements (TS
/// `MAX_CONVOLUTION_EFFECT_WGPU_KERNEL_SIZE`). The uniform struct packs to 244 bytes, within the
/// effect-pass 256-byte slot.
pub const MAX_CONVOLUTION_EFFECT_WGPU_KERNEL_SIZE: u32 = 49;

// Uniforms layout:
//   offset  0: texelSize (vec2f)   offset  8: matrixX (i32)   offset 12: matrixY (i32)
//   offset 16: divisor (f32)       offset 20: bias (f32)      offset 24: clampEdge (i32)
//   offset 28: preserveAlpha (i32) offset 32: edgeColor (vec4f)
//   offset 48: matrix (array<f32, 49>) — 244 bytes total, within the 256-byte slot.
// The source declares `matrix : array<f32, 49>` (interpolating
// MAX_CONVOLUTION_EFFECT_WGPU_KERNEL_SIZE). A uniform-space array needs a 16-byte stride, so native
// validation (naga, as Tint) rejects it; the kernel is declared here as `array<vec4f, 13>` over the
// SAME contiguous floats (offset 48, 208 bytes, ending exactly at the 256-byte slot) and read as
// `matrix[i / 4][i % 4]`. The CPU packing is unchanged. Deviation from the verbatim WGSL.
const CONVOLUTION_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  matrixX : i32,
  matrixY : i32,
  divisor : f32,
  bias : f32,
  clampEdge : i32,
  preserveAlpha : i32,
  edgeColor : vec4f,
  matrix : array<vec4f, 13>,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sampleAt(uv : vec2f) -> vec4f {
  if (uni.clampEdge != 0) {
    return textureSampleLevel(tex, smp, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0);
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return uni.edgeColor;
  }
  return textureSampleLevel(tex, smp, uv, 0.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let offsetX = uni.matrixX / 2;
  let offsetY = uni.matrixY / 2;
  var sum = vec4f(0.0);
  for (var ky : i32 = 0; ky < uni.matrixY; ky++) {
    for (var kx : i32 = 0; kx < uni.matrixX; kx++) {
      let index = ky * uni.matrixX + kx;
      let weight = uni.matrix[index / 4][index % 4];
      let off = vec2f(f32(kx - offsetX), f32(ky - offsetY)) * uni.texelSize;
      sum += sampleAt(uv + off) * weight;
    }
  }
  sum = sum / uni.divisor;
  sum += uni.bias / 255.0;
  sum = clamp(sum, vec4f(0.0), vec4f(1.0));
  if (uni.preserveAlpha != 0) {
    let origAlpha = textureSampleLevel(tex, smp, uv, 0.0).a;
    let straightRGB = select(vec3f(0.0), clamp(sum.rgb / sum.a, vec3f(0.0), vec3f(1.0)), sum.a > 0.0);
    sum = vec4f(straightRGB * origAlpha, origAlpha);
  }
  return sum;
}"#;

/// Applies a `ConvolutionEffect` from `source` into `dest` (TS `applyConvolutionEffectToWgpu`).
/// Panics (TS throws) when the dimensions are not positive, exceed 7x7, or outrun the matrix.
pub fn apply_convolution_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &ConvolutionEffect,
) {
    let matrix_x = effect.matrix_x;
    let matrix_y = effect.matrix_y;
    if matrix_x <= 0.0 || matrix_y <= 0.0 {
        throw_error("Convolution matrix dimensions must be positive");
    }
    if matrix_x * matrix_y > MAX_CONVOLUTION_EFFECT_WGPU_KERNEL_SIZE as f32 {
        throw_error(&format!(
            "Convolution kernel exceeds the WebGPU maximum of 7×7 ({}×{} given)",
            crate::wgpu_effect_runtime::format_wgpu_effect_number(matrix_x),
            crate::wgpu_effect_runtime::format_wgpu_effect_number(matrix_y)
        ));
    }
    let length = (matrix_x * matrix_y) as usize;
    if effect.matrix.len() < length {
        throw_error("Convolution matrix does not match its declared dimensions");
    }

    let bias = effect.bias.unwrap_or(0.0);
    let clamp_edge = effect.clamp.unwrap_or(true);
    let preserve_alpha = effect.preserve_alpha.unwrap_or(true);
    let edge_color = effect.color.unwrap_or(0);
    let divisor = effect
        .divisor
        .unwrap_or_else(|| get_auto_divisor(&effect.matrix, length));
    let matrix = &effect.matrix;
    let width = source.width as f32;
    let height = source.height as f32;

    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.convolution",
        CONVOLUTION_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, i32| {
            // texelSize at offset 0 (f32[0], f32[1])
            f32[0] = 1.0 / width;
            f32[1] = 1.0 / height;
            // matrixX, matrixY at offset 8, 12 (i32[2], i32[3])
            i32[2] = matrix_x as i32;
            i32[3] = matrix_y as i32;
            // divisor, bias at offset 16, 20 (f32[4], f32[5])
            f32[4] = divisor;
            f32[5] = bias;
            // clampEdge, preserveAlpha at offset 24, 28 (i32[6], i32[7])
            i32[6] = if clamp_edge { 1 } else { 0 };
            i32[7] = if preserve_alpha { 1 } else { 0 };
            // edgeColor at offset 32 (f32[8..11])
            let mut edge = [0.0_f32; 4];
            unpack_color_rgba(&mut edge, edge_color);
            f32[8] = edge[0];
            f32[9] = edge[1];
            f32[10] = edge[2];
            f32[11] = edge[3];
            // matrix at offset 48 (f32[12..60])
            f32[12..(length + 12)].copy_from_slice(&matrix[..length]);
        },
    );
}

// Sums the kernel weights; returns 1 when the sum is 0 (e.g. an edge-detect kernel) so the divide
// is safe.
fn get_auto_divisor(matrix: &[f32], length: usize) -> f32 {
    let mut sum = 0.0;
    for value in matrix.iter().take(length) {
        sum += value;
    }
    return if sum == 0.0 { 1.0 } else { sum };
}

/// Registers the default runner under `ConvolutionEffect` (TS `registerWgpuConvolutionEffect`).
pub fn register_wgpu_convolution_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "ConvolutionEffect", wgpu_convolution_effect_runner, None);
}

/// The default `ConvolutionEffect` runner (TS `wgpuConvolutionEffectRunner`).
pub fn wgpu_convolution_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<ConvolutionEffect>(effect, "wgpuConvolutionEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_convolution_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
