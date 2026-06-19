import type { ColorTransform, MaterialData, WebGLMaterialRenderer, WebGLRenderState } from '@flighthq/types';
import { ColorTransformMaterialKind } from '@flighthq/types';

import type { WebGLColorTransformInstancedShader } from './internal';
import { registerWebGLMaterialRenderer } from './webglMaterialRegistry';
import { getWebGLRenderStateRuntime } from './webglRenderState';
import {
  bindWebGLQuadBatchBaseAttributes,
  setWebGLQuadBatchWorldAndTexture,
  useWebGLQuadBatchProgram,
} from './webglSpriteBatch';

const COLOR_TRANSFORM_INSTANCE_FLOATS = 8;
const COLOR_TRANSFORM_INSTANCE_STRIDE = COLOR_TRANSFORM_INSTANCE_FLOATS * 4;

const CT_INSTANCED_VS = `#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec2 a_size;
layout(location = 5) in vec4 a_uvRect;
layout(location = 6) in float a_alpha;
layout(location = 7) in vec4 a_ctMult;
layout(location = 8) in vec4 a_ctOff;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;
out vec4 v_ctMult;
out vec4 v_ctOff;

void main() {
  vec2 local = a_corner * a_size;
  vec2 worldPos = vec2(
    a_matAB.x * local.x + a_matCD.x * local.y + a_matTXTY.x,
    a_matAB.y * local.x + a_matCD.y * local.y + a_matTXTY.y
  );
  vec3 clip = u_world * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_texCoord = mix(a_uvRect.xy, a_uvRect.zw, a_corner);
  v_alpha = a_alpha;
  v_ctMult = a_ctMult;
  v_ctOff = a_ctOff;
}`;

const CT_INSTANCED_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_ctMult;
in vec4 v_ctOff;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord) * clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = clamp(color * v_ctMult + v_ctOff, vec4(0.0), vec4(1.0));
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

function ensureWebGLColorTransformInstancedShader(state: WebGLRenderState): WebGLColorTransformInstancedShader {
  const runtime = getWebGLRenderStateRuntime(state);
  if (runtime.colorTransformInstancedShader) return runtime.colorTransformInstancedShader;

  const gl = state.gl;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, CT_INSTANCED_VS);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, CT_INSTANCED_FS);
  gl.compileShader(fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  runtime.colorTransformInstancedShader = {
    program,
    locCorner: 0,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
  };
  return runtime.colorTransformInstancedShader;
}

export function registerWebGLColorTransformMaterial(state: WebGLRenderState): void {
  registerWebGLMaterialRenderer(state, ColorTransformMaterialKind, colorTransformWebGLMaterialRenderer);
}

// Per-instance color transform: reads each node's resolved color transform (materialData) and packs
// it as two vec4 instance attributes, so independently-tinted nodes share one batch.
export const colorTransformWebGLMaterialRenderer: WebGLMaterialRenderer = {
  instanceFloatCount: COLOR_TRANSFORM_INSTANCE_FLOATS,
  bind(state: WebGLRenderState): void {
    const runtime = getWebGLRenderStateRuntime(state);
    const shader = ensureWebGLColorTransformInstancedShader(state);
    useWebGLQuadBatchProgram(state, shader.program);
    setWebGLQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture);
    bindWebGLQuadBatchBaseAttributes(state, shader.locCorner);

    const gl = state.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialBuffer!);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 4, gl.FLOAT, false, COLOR_TRANSFORM_INSTANCE_STRIDE, 0);
    gl.vertexAttribDivisor(7, 1);
    gl.enableVertexAttribArray(8);
    gl.vertexAttribPointer(8, 4, gl.FLOAT, false, COLOR_TRANSFORM_INSTANCE_STRIDE, 16);
    gl.vertexAttribDivisor(8, 1);
  },
  packInstance(_state: WebGLRenderState, materialData: MaterialData | null, out: Float32Array, offset: number): void {
    const ct = materialData as ColorTransform | null;
    if (ct !== null) {
      out[offset] = ct.redMultiplier;
      out[offset + 1] = ct.greenMultiplier;
      out[offset + 2] = ct.blueMultiplier;
      out[offset + 3] = ct.alphaMultiplier;
      out[offset + 4] = ct.redOffset / 255;
      out[offset + 5] = ct.greenOffset / 255;
      out[offset + 6] = ct.blueOffset / 255;
      out[offset + 7] = ct.alphaOffset / 255;
    } else {
      out[offset] = 1;
      out[offset + 1] = 1;
      out[offset + 2] = 1;
      out[offset + 3] = 1;
      out[offset + 4] = 0;
      out[offset + 5] = 0;
      out[offset + 6] = 0;
      out[offset + 7] = 0;
    }
  },
};
