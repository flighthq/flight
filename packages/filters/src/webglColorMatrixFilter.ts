import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderStateInternal } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';
import type { ColorMatrixFilter } from '@flighthq/types';

import type { WebGLFilterLocations } from './webglFilterPass';
import { compileWebGLFilterProgram, drawWebGLFilterPass } from './webglFilterPass';

// The 20-element color matrix follows the OpenFL/Flash convention:
//   [r*m[0]  + g*m[1]  + b*m[2]  + a*m[3]  + m[4]]   → red out
//   [r*m[5]  + g*m[6]  + b*m[7]  + a*m[8]  + m[9]]   → green out
//   [r*m[10] + g*m[11] + b*m[12] + a*m[13] + m[14]]  → blue out
//   [r*m[15] + g*m[16] + b*m[17] + a*m[18] + m[19]]  → alpha out
//
// Input values are normalized [0,1] straight RGBA (shader unmultiplies first).
// Offsets (m[4], m[9], m[14], m[19]) are in byte scale [0,255] and are divided
// by 255 before upload to convert to the [0,1] shader range.

const COLOR_MATRIX_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec4 u_m0;
uniform vec4 u_m1;
uniform vec4 u_m2;
uniform vec4 u_m3;
uniform vec4 u_offsets;
out vec4 fragColor;

void main() {
  vec4 c = texture(u_texture, v_texCoord);
  if (c.a > 0.0) {
    c.rgb /= c.a;
  }
  vec4 out_c;
  out_c.r = clamp(dot(c, u_m0) + u_offsets.r, 0.0, 1.0);
  out_c.g = clamp(dot(c, u_m1) + u_offsets.g, 0.0, 1.0);
  out_c.b = clamp(dot(c, u_m2) + u_offsets.b, 0.0, 1.0);
  out_c.a = clamp(dot(c, u_m3) + u_offsets.a, 0.0, 1.0);
  out_c.rgb *= out_c.a;
  fragColor = out_c;
}`;

type ColorMatrixShaderLocations = WebGLFilterLocations & {
  locM0: WebGLUniformLocation;
  locM1: WebGLUniformLocation;
  locM2: WebGLUniformLocation;
  locM3: WebGLUniformLocation;
  locOffsets: WebGLUniformLocation;
};

const _shaders = new WeakMap<WebGLRenderState, ColorMatrixShaderLocations>();

function getShader(state: WebGLRenderState): ColorMatrixShaderLocations {
  let loc = _shaders.get(state);
  if (loc === undefined) {
    const gl = (state as WebGLRenderStateInternal).gl;
    const base = compileWebGLFilterProgram(gl, COLOR_MATRIX_FRAGMENT_SRC);
    loc = {
      ...base,
      locM0: gl.getUniformLocation(base.program, 'u_m0')!,
      locM1: gl.getUniformLocation(base.program, 'u_m1')!,
      locM2: gl.getUniformLocation(base.program, 'u_m2')!,
      locM3: gl.getUniformLocation(base.program, 'u_m3')!,
      locOffsets: gl.getUniformLocation(base.program, 'u_offsets')!,
    };
    _shaders.set(state, loc);
  }
  return loc;
}

/**
 * Applies a 4×5 color matrix filter to `source` and writes to `dest`.
 * The matrix is 20 values in OpenFL/Flash order: 4 rows × 5 columns,
 * where the 5th column is an additive offset in byte scale [0,255].
 */
export function applyWebGLColorMatrixFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  options: Omit<ColorMatrixFilter, 'type'>,
): void {
  const { matrix } = options;
  if (matrix.length < 20) throw new Error('Color matrix filter requires 20 values');

  const loc = getShader(state);
  drawWebGLFilterPass(state, source, dest, loc, (gl) => {
    gl.uniform4f(loc.locM0, matrix[0], matrix[1], matrix[2], matrix[3]);
    gl.uniform4f(loc.locM1, matrix[5], matrix[6], matrix[7], matrix[8]);
    gl.uniform4f(loc.locM2, matrix[10], matrix[11], matrix[12], matrix[13]);
    gl.uniform4f(loc.locM3, matrix[15], matrix[16], matrix[17], matrix[18]);
    gl.uniform4f(loc.locOffsets, matrix[4] / 255, matrix[9] / 255, matrix[14] / 255, matrix[19] / 255);
  });
}
