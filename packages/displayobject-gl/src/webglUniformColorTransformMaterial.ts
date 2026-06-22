import { registerGlMaterialRenderer } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { GlMaterialRenderer, GlRenderState, Material, UniformColorTransformMaterial } from '@flighthq/types';
import type { GlUniformColorTransformShader } from '@flighthq/types';
import { UniformColorTransformMaterialKind } from '@flighthq/types';

import {
  bindGlQuadBatchBaseAttributes,
  QUAD_BATCH_VS,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './webglSpriteBatch';

const UNIFORM_CT_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
uniform sampler2D u_texture;
uniform vec4 u_ctMult;
uniform vec4 u_ctOff;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord) * clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = clamp(color * u_ctMult + u_ctOff, vec4(0.0), vec4(1.0));
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

function ensureGlUniformColorTransformShader(state: GlRenderState): GlUniformColorTransformShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.uniformColorTransformShader) return runtime.uniformColorTransformShader;

  const gl = state.gl;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, QUAD_BATCH_VS);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, UNIFORM_CT_FS);
  gl.compileShader(fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  runtime.uniformColorTransformShader = {
    program,
    locCorner: 0,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locColorMultiplier: gl.getUniformLocation(program, 'u_ctMult')!,
    locColorOffset: gl.getUniformLocation(program, 'u_ctOff')!,
  };
  return runtime.uniformColorTransformShader;
}

export function registerGlUniformColorTransformMaterial(state: GlRenderState): void {
  registerGlMaterialRenderer(state, UniformColorTransformMaterialKind, uniformColorTransformGlMaterialRenderer);
}

// Per-batch color transform: the value lives on the material and uploads as a uniform shared by the
// whole batch. Uses its own shader (the base vertex shader + a color-transform fragment shader) so
// the default quad-batch shader carries no color-transform record.
export const uniformColorTransformGlMaterialRenderer: GlMaterialRenderer = {
  instanceFloatCount: 0,
  bind(state: GlRenderState, material: Readonly<Material> | null): void {
    const shader = ensureGlUniformColorTransformShader(state);
    useGlQuadBatchProgram(state, shader.program);
    setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture);

    const gl = state.gl;
    const ct = (material as UniformColorTransformMaterial).colorTransform;
    gl.uniform4f(
      shader.locColorMultiplier,
      ct.redMultiplier,
      ct.greenMultiplier,
      ct.blueMultiplier,
      ct.alphaMultiplier,
    );
    gl.uniform4f(
      shader.locColorOffset,
      ct.redOffset / 255,
      ct.greenOffset / 255,
      ct.blueOffset / 255,
      ct.alphaOffset / 255,
    );
    bindGlQuadBatchBaseAttributes(state, shader.locCorner);
  },
};
