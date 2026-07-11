import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type { ConvolutionEffect, GlRenderEffectRunner, GlRenderState, GlRenderTarget } from '@flighthq/types';

import { getGlEffectProgram } from './glEffectProgramCache';

// Largest kernel the WebGL path supports (a 7×7). The cap is the fixed uniform-array size in the
// fragment shader; larger kernels are unsupported on this backend.
export const MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE = 49;

// Generic matrix-kernel convolution: each output pixel is the weighted sum of its matrixX×matrixY
// neighborhood, normalized by `divisor` (defaults to the matrix sum) and offset by `bias`.
export function applyConvolutionEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ConvolutionEffect>,
): void {
  const { matrix, matrixX, matrixY } = effect;
  if (matrixX <= 0 || matrixY <= 0) throw new Error('Convolution matrix dimensions must be positive');
  if (matrixX * matrixY > MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE)
    throw new Error(`Convolution kernel exceeds the WebGL maximum of 7×7 (${matrixX}×${matrixY} given)`);
  if (matrix.length < matrixX * matrixY) throw new Error('Convolution matrix does not match its declared dimensions');

  const bias = effect.bias ?? 0;
  const clampEdge = effect.clamp ?? true;
  const preserveAlpha = effect.preserveAlpha ?? true;
  const edgeColor = effect.color ?? 0;
  const divisor = effect.divisor ?? getAutoDivisor(matrix, matrixX * matrixY);

  const matrixData = new Float32Array(MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE);
  for (let i = 0; i < matrixX * matrixY; i++) matrixData[i] = matrix[i];

  const program = getGlEffectProgram(state, 'stylization.convolution', CONVOLUTION_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_texelSize'), 1 / source.width, 1 / source.height);
    gl.uniform1fv(gl.getUniformLocation(p.program, 'u_matrix[0]'), matrixData);
    gl.uniform1i(gl.getUniformLocation(p.program, 'u_matrixX'), matrixX);
    gl.uniform1i(gl.getUniformLocation(p.program, 'u_matrixY'), matrixY);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_divisor'), divisor);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_bias'), bias);
    gl.uniform1i(gl.getUniformLocation(p.program, 'u_clamp'), clampEdge ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(p.program, 'u_preserveAlpha'), preserveAlpha ? 1 : 0);
    gl.uniform4f(
      gl.getUniformLocation(p.program, 'u_edgeColor'),
      ((edgeColor >> 16) & 0xff) / 255,
      ((edgeColor >> 8) & 0xff) / 255,
      (edgeColor & 0xff) / 255,
      ((edgeColor >>> 24) & 0xff) / 255,
    );
  });
}

export const defaultGlConvolutionEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyConvolutionEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ConvolutionEffect);
};

// Sums the kernel weights; returns 1 when the sum is 0 (e.g. an edge-detect kernel) so the divide is safe.
function getAutoDivisor(matrix: ReadonlyArray<number>, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += matrix[i];
  return sum === 0 ? 1 : sum;
}

const CONVOLUTION_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_texelSize;
uniform float u_matrix[${MAX_CONVOLUTION_EFFECT_GL_KERNEL_SIZE}];
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
}`;
