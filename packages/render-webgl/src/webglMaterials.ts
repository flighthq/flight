import type { DisplayObjectRenderNode, RenderNode, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { setWebGLAttribs, setWebGLBaseUniforms, setWebGLMatrixFromTransform } from './webglShader';
import { registerWebGLBitmapShader } from './webglShaderRegistry';
import type { WebGLBitmapShader, WebGLShaderLocations } from './webglShaderTypes';

export function registerWebGLColorTransformShader(state: WebGLRenderState): void {
  const internal = state as WebGLRenderStateInternal;
  if (internal.colorTransformBitmapShader !== undefined) return;

  const shaderLoc = compileWebGLColorTransformProgram(internal.gl);
  internal.colorTransformBitmapShader = createWebGLColorTransformBitmapShader(shaderLoc, internal.matrixArray);
  registerWebGLBitmapShader(state, internal.colorTransformBitmapShader);
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function compileWebGLColorTransformProgram(gl: WebGL2RenderingContext): WebGLShaderLocations {
  const vs = compileShader(gl, gl.VERTEX_SHADER, COLOR_TRANSFORM_VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, COLOR_TRANSFORM_FRAGMENT_SRC);
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
    locColorMultiplier: gl.getUniformLocation(program, 'u_cm')!,
    locColorOffset: gl.getUniformLocation(program, 'u_co')!,
    locHasColorTransform: gl.getUniformLocation(program, 'u_ct')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
  };
}

function createWebGLColorTransformBitmapShader(
  shaderLoc: WebGLShaderLocations,
  matrixArray: Float32Array,
): WebGLBitmapShader {
  return {
    locations: shaderLoc,
    program: shaderLoc.program,
    bind(gl: WebGL2RenderingContext, state: WebGLRenderState, renderNode: DisplayObjectRenderNode): void {
      setWebGLAttribs(gl, shaderLoc);
      setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, renderNode.transform2D, state.canvas);
      setWebGLBaseUniforms(gl, shaderLoc, renderNode);
      setWebGLColorTransformUniforms(gl, shaderLoc, renderNode);
    },
  };
}

function setWebGLColorTransformUniforms(
  gl: WebGL2RenderingContext,
  loc: WebGLShaderLocations,
  renderNode: RenderNode,
): void {
  gl.uniform1i(loc.locHasColorTransform!, renderNode.useColorTransform ? 1 : 0);

  if (!renderNode.useColorTransform) return;

  const colorTransform = renderNode.colorTransform;
  gl.uniform4f(
    loc.locColorMultiplier!,
    colorTransform.redMultiplier,
    colorTransform.greenMultiplier,
    colorTransform.blueMultiplier,
    colorTransform.alphaMultiplier,
  );
  gl.uniform4f(
    loc.locColorOffset!,
    colorTransform.redOffset / 255,
    colorTransform.greenOffset / 255,
    colorTransform.blueOffset / 255,
    colorTransform.alphaOffset / 255,
  );
}

const COLOR_TRANSFORM_FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_alpha;
uniform bool u_ct;
uniform vec4 u_cm,u_co;
out vec4 fragColor;
void main(){
vec4 c=texture(u_texture,v_texCoord);
if(u_ct&&c.a>0.){
c.rgb/=c.a;
c=clamp(c*u_cm+u_co,0.,1.);
c.rgb*=c.a;
}
fragColor=c*clamp(u_alpha,0.,1.);
}`;

const COLOR_TRANSFORM_VERTEX_SRC = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
uniform mat3 u_matrix;
out vec2 v_texCoord;
void main() {
  vec3 pos = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;
