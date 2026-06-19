import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { ColorMatrixFilter } from '@flighthq/types';
import type { WebGLRenderState } from '@flighthq/types';

import type { WebGLFilterLocations } from './filterPass';
import { compileWebGLFilterProgram, drawWebGLFilterPass } from './filterPass';

// 20-element matrix in OpenFL/Flash order: 4 rows × 5 columns.
// Offsets (column 5) are in byte scale [0,255], divided by 255 before upload.
// Input is straight RGBA (shader unmultiplies first), output is premultiplied.
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
  if (c.a > 0.0) { c.rgb /= c.a; }
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

const shaders = new WeakMap<WebGLRenderState, ColorMatrixShaderLocations>();

/**
 * Applies a 4×5 color matrix filter to `source`, writing to `dest`.
 * The matrix is 20 values in OpenFL/Flash order; the 5th column is an additive
 * offset in byte scale [0,255].
 */
export function applyColorMatrixFilterToWebGL(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  filter: Readonly<Omit<ColorMatrixFilter, 'type'>>,
): void {
  const { matrix } = filter;
  if (matrix.length < 20) throw new Error('ColorMatrixFilter requires 20 values');

  const loc = getShader(state);
  drawWebGLFilterPass(state, source, dest, loc, (gl) => {
    gl.uniform4f(loc.locM0, matrix[0], matrix[1], matrix[2], matrix[3]);
    gl.uniform4f(loc.locM1, matrix[5], matrix[6], matrix[7], matrix[8]);
    gl.uniform4f(loc.locM2, matrix[10], matrix[11], matrix[12], matrix[13]);
    gl.uniform4f(loc.locM3, matrix[15], matrix[16], matrix[17], matrix[18]);
    gl.uniform4f(loc.locOffsets, matrix[4] / 255, matrix[9] / 255, matrix[14] / 255, matrix[19] / 255);
  });
}

function getShader(state: WebGLRenderState): ColorMatrixShaderLocations {
  let loc = shaders.get(state);
  if (loc === undefined) {
    const gl = state.gl;
    const base = compileWebGLFilterProgram(gl, COLOR_MATRIX_FRAGMENT_SRC);
    loc = {
      ...base,
      locM0: gl.getUniformLocation(base.program, 'u_m0')!,
      locM1: gl.getUniformLocation(base.program, 'u_m1')!,
      locM2: gl.getUniformLocation(base.program, 'u_m2')!,
      locM3: gl.getUniformLocation(base.program, 'u_m3')!,
      locOffsets: gl.getUniformLocation(base.program, 'u_offsets')!,
    };
    shaders.set(state, loc);
  }
  return loc;
}
