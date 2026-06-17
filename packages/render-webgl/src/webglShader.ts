import type { RenderProxy, RenderProxy2D, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

export type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

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
  vec4 color = texture(u_texture, v_texCoord) * clamp(u_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  fragColor = color;
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

export function compileDefaultWebGLProgram(gl: WebGL2RenderingContext): WebGLShaderLocations {
  return compileWebGLBitmapProgram(gl);
}

/**
 * Compiles a bitmap program, reusing the standard quad vertex shader. Pass a
 * custom fragment source to build a custom shader; it must declare the interface
 * the draw path drives — `in vec2 v_texCoord`, `uniform sampler2D u_texture`,
 * `uniform float u_alpha` — and may add its own uniforms, resolved against the
 * returned `program`.
 */
export function compileWebGLBitmapProgram(
  gl: WebGL2RenderingContext,
  fragmentSrc: string = FRAGMENT_SRC,
): WebGLShaderLocations {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);
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

export function createDefaultWebGLBitmapShader(
  shaderLoc: WebGLShaderLocations,
  matrixArray: Float32Array,
): WebGLBitmapShader {
  return {
    locations: shaderLoc,
    program: shaderLoc.program,
    bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderProxy: RenderProxy2D): void {
      const internal = state as WebGLRenderStateInternal;
      setWebGLAttributes(gl, shaderLoc);
      setWebGLMatrixFromTransform(
        gl,
        shaderLoc,
        matrixArray,
        renderProxy.transform2D,
        internal.renderTargetViewport ?? state.canvas,
      );
      setWebGLBaseUniforms(gl, shaderLoc, renderProxy);
    },
  };
}

/**
 * Builds a custom bitmap shader from a fragment shader source, ready to pass to
 * `setWebGLShader(state, node, shader)`. The standard quad vertex shader is
 * reused, so the fragment shader must sample `u_texture` and respect `u_alpha`;
 * any extra uniforms can be set per draw via `onBind` (resolve them against
 * `locations.program`).
 */
export function createWebGLBitmapShader(
  gl: WebGL2RenderingContext,
  fragmentSrc: string,
  onBind?: (gl: WebGL2RenderingContext, locations: WebGLShaderLocations, renderProxy: RenderProxy2D) => void,
): WebGLBitmapShader {
  const locations = compileWebGLBitmapProgram(gl, fragmentSrc);
  return {
    locations,
    program: locations.program,
    bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderProxy: RenderProxy2D): void {
      const internal = state as WebGLRenderStateInternal;
      setWebGLAttributes(gl, locations);
      setWebGLMatrixFromTransform(
        gl,
        locations,
        internal.matrixArray,
        renderProxy.transform2D,
        internal.renderTargetViewport ?? state.canvas,
      );
      setWebGLBaseUniforms(gl, locations, renderProxy);
      onBind?.(gl, locations, renderProxy);
    },
  };
}

export function setWebGLAttributes(gl: WebGL2RenderingContext, loc: WebGLShaderLocations): void {
  gl.enableVertexAttribArray(loc.locPosition);
  gl.enableVertexAttribArray(loc.locTexCoord);
  gl.vertexAttribPointer(loc.locPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(loc.locTexCoord, 2, gl.FLOAT, false, 16, 8);
}

export function setWebGLBaseUniforms(
  gl: WebGL2RenderingContext,
  loc: WebGLShaderLocations,
  renderProxy: RenderProxy,
): void {
  gl.uniform1f(loc.locAlpha, renderProxy.alpha);
  gl.uniform1i(loc.locTexture, 0);
}

export function setWebGLMatrixFromTransform(
  gl: WebGL2RenderingContext,
  loc: WebGLShaderLocations,
  m: Float32Array,
  t: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  viewport: { width: number; height: number },
): void {
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;
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
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
  viewport: { width: number; height: number },
): void {
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;
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
