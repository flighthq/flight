import type { BitmapShader, DisplayObjectRenderNode, WebGLRenderState } from '@flighthq/types';

import type { WebGLShaderLocations } from './internal';

const VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
uniform mat3 u_matrix;
out vec2 v_texCoord;
void main() {
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_alpha;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord) * u_alpha;
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export function compileDefaultProgram(gl: WebGL2RenderingContext): WebGLShaderLocations {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return {
    program,
    locPosition: gl.getAttribLocation(program, 'a_position'),
    locTexCoord: gl.getAttribLocation(program, 'a_texCoord'),
    locMatrix: gl.getUniformLocation(program, 'u_matrix')!,
    locAlpha: gl.getUniformLocation(program, 'u_alpha')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
  };
}

export function createDefaultBitmapShader(
  shaderLoc: WebGLShaderLocations,
  matrixArray: Float32Array,
): BitmapShader {
  return {
    program: shaderLoc.program,
    bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderNode: DisplayObjectRenderNode): void {
      setWebGLAttribs(gl, shaderLoc);
      setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, renderNode.transform2D, state.canvas);
      gl.uniform1f(shaderLoc.locAlpha, renderNode.alpha);
      gl.uniform1i(shaderLoc.locTexture, 0);
    },
  };
}

export function setWebGLAttribs(gl: WebGL2RenderingContext, loc: WebGLShaderLocations): void {
  gl.enableVertexAttribArray(loc.locPosition);
  gl.enableVertexAttribArray(loc.locTexCoord);
  gl.vertexAttribPointer(loc.locPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(loc.locTexCoord, 2, gl.FLOAT, false, 16, 8);
}

export function setWebGLMatrixFromTransform(
  gl: WebGL2RenderingContext,
  loc: WebGLShaderLocations,
  m: Float32Array,
  t: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  canvas: HTMLCanvasElement,
): void {
  const iw = 2 / canvas.width;
  const ih = 2 / canvas.height;
  m[0] = t.a * iw;
  m[1] = -t.b * ih;
  m[2] = 0;
  m[3] = t.c * iw;
  m[4] = -t.d * ih;
  m[5] = 0;
  m[6] = t.tx * iw - 1;
  m[7] = -t.ty * ih + 1;
  m[8] = 1;
  gl.uniformMatrix3fv(loc.locMatrix, false, m);
}

export function setWebGLMatrixFromValues(
  gl: WebGL2RenderingContext,
  loc: WebGLShaderLocations,
  m: Float32Array,
  a: number, b: number, c: number, d: number, tx: number, ty: number,
  canvas: HTMLCanvasElement,
): void {
  const iw = 2 / canvas.width;
  const ih = 2 / canvas.height;
  m[0] = a * iw;
  m[1] = -b * ih;
  m[2] = 0;
  m[3] = c * iw;
  m[4] = -d * ih;
  m[5] = 0;
  m[6] = tx * iw - 1;
  m[7] = -ty * ih + 1;
  m[8] = 1;
  gl.uniformMatrix3fv(loc.locMatrix, false, m);
}
