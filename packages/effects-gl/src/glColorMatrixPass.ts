import { drawGlFullscreenPass } from '@flighthq/render-gl/contract';
import type { GlRenderState, GlRenderTarget } from '@flighthq/types/contract';

import { getGlEffectProgram } from './glEffectProgramCache';

// Generic pointwise color-matrix pass — the single fold-in realization for the whole matrix-tier
// Adjustment family. A run of consecutive matrix-tier adjustments fuses to ONE 4×5 matrix (in the
// adjustments colorMatrixMath convention: linear RGBA coefficients + normalized-linear bias column) and runs
// through this one pass instead of one pass per op. Sampled color is treated as premultiplied and the
// RGB result is clamped, matching the per-op color passes this replaces.
export function applyColorMatrixPassToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  matrix: ReadonlyArray<number>,
): void {
  const m = new Float32Array(20);
  for (let i = 0; i < 20; i++) m[i] = matrix[i] ?? 0;
  const program = getGlEffectProgram(state, 'adjustment.colorMatrix', COLOR_MATRIX_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1fv(gl.getUniformLocation(p.program, 'u_colorMatrix'), m);
  });
}

// The bias column (indices 4, 9, 14, 19) is already normalized-linear.
const COLOR_MATRIX_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_colorMatrix[20];
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float r = c.r, g = c.g, b = c.b, a = c.a;
  float nr = u_colorMatrix[0] * r + u_colorMatrix[1] * g + u_colorMatrix[2] * b + u_colorMatrix[3] * a + u_colorMatrix[4];
  float ng = u_colorMatrix[5] * r + u_colorMatrix[6] * g + u_colorMatrix[7] * b + u_colorMatrix[8] * a + u_colorMatrix[9];
  float nb = u_colorMatrix[10] * r + u_colorMatrix[11] * g + u_colorMatrix[12] * b + u_colorMatrix[13] * a + u_colorMatrix[14];
  float na = u_colorMatrix[15] * r + u_colorMatrix[16] * g + u_colorMatrix[17] * b + u_colorMatrix[18] * a + u_colorMatrix[19];
  o_color = vec4(clamp(vec3(nr, ng, nb), 0.0, 1.0), na);
}`;
