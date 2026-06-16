import type {
  ColorTransform,
  Material,
  MaterialData,
  UniformColorTransformMaterial,
  WebGLMaterialRenderer,
  WebGLRenderState,
} from '@flighthq/types';
import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import type { WebGLColorTransformInstancedShader, WebGLRenderStateInternal } from './internal';
import { registerWebGLMaterialRenderer } from './webglMaterialRegistry';
import {
  bindWebGLQuadBatchBaseAttributes,
  ensureWebGLQuadBatchShader,
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

function ensureWebGLColorTransformInstancedShader(state: WebGLRenderStateInternal): WebGLColorTransformInstancedShader {
  if (state.colorTransformInstancedShader) return state.colorTransformInstancedShader;

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

  state.colorTransformInstancedShader = {
    program,
    locCorner: 0,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
  };
  return state.colorTransformInstancedShader;
}

export function registerWebGLColorTransformMaterials(state: WebGLRenderState): void {
  registerWebGLMaterialRenderer(state, UniformColorTransformMaterialKind, uniformColorTransformWebGLMaterialRenderer);
  registerWebGLMaterialRenderer(state, ColorTransformMaterialKind, colorTransformWebGLMaterialRenderer);
}

// Per-instance color transform: reads each node's resolved color transform and packs it as two
// vec4 instance attributes, so independently-tinted nodes share one batch.
export const colorTransformWebGLMaterialRenderer: WebGLMaterialRenderer = {
  instanceFloatCount: COLOR_TRANSFORM_INSTANCE_FLOATS,
  bind(state: WebGLRenderState): void {
    const internal = state as WebGLRenderStateInternal;
    const shader = ensureWebGLColorTransformInstancedShader(internal);
    useWebGLQuadBatchProgram(internal, shader.program);
    setWebGLQuadBatchWorldAndTexture(internal, shader.locWorldMatrix, shader.locTexture);
    bindWebGLQuadBatchBaseAttributes(internal, shader.locCorner);

    const gl = internal.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, internal.spriteBatchMaterialBuffer!);
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

// Per-batch color transform: the value lives on the material and uploads as a uniform shared by
// the whole batch, reusing the default quad-batch program's color-transform path.
export const uniformColorTransformWebGLMaterialRenderer: WebGLMaterialRenderer = {
  instanceFloatCount: 0,
  bind(state: WebGLRenderState, material: Readonly<Material> | null): void {
    const internal = state as WebGLRenderStateInternal;
    const shader = ensureWebGLQuadBatchShader(internal);
    useWebGLQuadBatchProgram(internal, shader.program);
    setWebGLQuadBatchWorldAndTexture(internal, shader.locWorldMatrix, shader.locTexture);

    const gl = internal.gl;
    const ct = (material as UniformColorTransformMaterial).colorTransform;
    if (shader.locHasColorTransform !== null) {
      gl.uniform1i(shader.locHasColorTransform, 1);
      gl.uniform4f(
        shader.locColorMultiplier!,
        ct.redMultiplier,
        ct.greenMultiplier,
        ct.blueMultiplier,
        ct.alphaMultiplier,
      );
      gl.uniform4f(
        shader.locColorOffset!,
        ct.redOffset / 255,
        ct.greenOffset / 255,
        ct.blueOffset / 255,
        ct.alphaOffset / 255,
      );
    }
    bindWebGLQuadBatchBaseAttributes(internal, shader.locCorner);
  },
};
