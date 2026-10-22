// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Generic matrix-kernel convolution: each output pixel is the weighted sum of its
//! matrix_x×matrix_y neighborhood, normalized by `divisor` (defaults to the matrix sum) and offset by
//! `bias`.

use flight_color::unpack_color_rgba;
use flight_effects::{ConvolutionEffect, Effect};
use flight_entity::throw_error;
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_1fv, uniform_1i, uniform_2f, uniform_4f};

/// Largest kernel the GL path supports (a 7×7). The cap is the fixed uniform-array size in the
/// fragment shader; larger kernels are unsupported on this backend.
pub const MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE: usize = 49;

// The uniform array length is MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE (TS interpolates the constant).
const CONVOLUTION_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_texelSize;
uniform float u_matrix[49];
uniform int u_matrixX;
uniform int u_matrixY;
uniform float u_divisor;
uniform float u_bias;
uniform bool u_clamp;
uniform bool u_preserveAlpha;
uniform vec4 u_edgeColor;
out vec4 fragColor;

vec4 sampleAt(vec2 uv) {
  if (u_clamp) {
    return texture(u_texture0, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return u_edgeColor;
  }
  return texture(u_texture0, uv);
}

void main() {
  int offsetX = u_matrixX / 2;
  int offsetY = u_matrixY / 2;
  vec4 sum = vec4(0.0);
  for (int ky = 0; ky < u_matrixY; ky++) {
    for (int kx = 0; kx < u_matrixX; kx++) {
      float weight = u_matrix[ky * u_matrixX + kx];
      vec2 off = vec2(float(kx - offsetX), float(ky - offsetY)) * u_texelSize;
      sum += sampleAt(v_texCoord + off) * weight;
    }
  }
  sum /= u_divisor;
  sum += u_bias / 255.0;
  sum = clamp(sum, 0.0, 1.0);
  if (u_preserveAlpha) {
    // Keep the convolved color and restore the source alpha, matching the reference: a zero-sum
    // kernel (e.g. edge-detect) drives the convolved alpha to 0, so overriding only .a leaves the
    // color channels as the non-preserve branch produces them.
    sum.a = texture(u_texture0, v_texCoord).a;
  }
  fragColor = sum;
}"#;

/// Throws (D10 programmer error) when the kernel dimensions are not positive, exceed 7×7, or do not
/// match the matrix length.
pub fn apply_convolution_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &ConvolutionEffect,
) -> Result<(), String> {
    let matrix = &effect.matrix;
    let matrix_x = effect.matrix_x;
    let matrix_y = effect.matrix_y;
    if matrix_x <= 0.0 || matrix_y <= 0.0 {
        throw_error("Convolution matrix dimensions must be positive");
    }
    if matrix_x * matrix_y > MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE as f32 {
        throw_error(&format!(
            "Convolution kernel exceeds the WebGL maximum of 7×7 ({matrix_x}×{matrix_y} given)"
        ));
    }
    let count = (matrix_x * matrix_y) as usize;
    if matrix.len() < count {
        throw_error("Convolution matrix does not match its declared dimensions");
    }

    let bias = effect.bias.unwrap_or(0.0);
    let clamp_edge = effect.clamp.unwrap_or(true);
    let preserve_alpha = effect.preserve_alpha.unwrap_or(true);
    let edge_color = effect.color.unwrap_or(0);
    let divisor = effect
        .divisor
        .unwrap_or_else(|| get_auto_divisor(matrix, count));

    let mut matrix_data = [0.0_f32; MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE];
    matrix_data[..count].copy_from_slice(&matrix[..count]);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;

    let program =
        get_gl_effect_program(state, "stylization.convolution", CONVOLUTION_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_2f(gl, p, "u_texelSize", 1.0 / width, 1.0 / height);
        uniform_1fv(gl, p, "u_matrix[0]", &matrix_data);
        uniform_1i(gl, p, "u_matrixX", matrix_x as i32);
        uniform_1i(gl, p, "u_matrixY", matrix_y as i32);
        uniform_1f(gl, p, "u_divisor", divisor);
        uniform_1f(gl, p, "u_bias", bias);
        uniform_1i(gl, p, "u_clamp", if clamp_edge { 1 } else { 0 });
        uniform_1i(gl, p, "u_preserveAlpha", if preserve_alpha { 1 } else { 0 });
        let mut scratch_edge_color = [0.0_f32; 4];
        unpack_color_rgba(&mut scratch_edge_color, edge_color);
        uniform_4f(
            gl,
            p,
            "u_edgeColor",
            scratch_edge_color[0],
            scratch_edge_color[1],
            scratch_edge_color[2],
            scratch_edge_color[3],
        );
    });
}

/// Sums the kernel weights; returns 1 when the sum is 0 (e.g. an edge-detect kernel) so the divide
/// is safe.
fn get_auto_divisor(matrix: &[f32], length: usize) -> f32 {
    let sum: f32 = matrix[..length].iter().sum();
    return if sum == 0.0 { 1.0 } else { sum };
}

pub fn gl_convolution_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<ConvolutionEffect>() else {
        return Ok(());
    };
    return apply_convolution_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_convolution_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "ConvolutionEffect",
        gl_convolution_effect_runner,
        None,
    );
}
