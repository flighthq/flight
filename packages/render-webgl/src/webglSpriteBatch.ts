import type { BlendMode, ColorTransform } from '@flighthq/types';

import type { WebGLQuadBatchShader, WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture } from './webglDraw';

// Per-instance layout (13 floats = 52 bytes, world-space transforms + per-instance alpha):
// [0-1]  a, b         — world-space 2D matrix column 1
// [2-3]  c, d         — world-space 2D matrix column 2
// [4-5]  tx, ty       — world-space translation
// [6-7]  width, height — region size in pixels
// [8-11] u0,v0,u1,v1  — atlas UV rect
// [12]   alpha        — per-instance alpha
const SPRITE_INSTANCE_FLOATS = 13;
const SPRITE_INSTANCE_STRIDE = SPRITE_INSTANCE_FLOATS * 4;

const QUAD_BATCH_VS = `#version 300 es
precision mediump float;

in vec2 a_corner;

layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec2 a_size;
layout(location = 5) in vec4 a_uvRect;
layout(location = 6) in float a_alpha;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;

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
}`;

const QUAD_BATCH_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
uniform sampler2D u_texture;
uniform bool u_hasCT;
uniform vec4 u_ctMult;
uniform vec4 u_ctOff;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord) * clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  if (u_hasCT && color.a > 0.0) {
    color = vec4(color.rgb / color.a, color.a);
    color = clamp(color * u_ctMult + u_ctOff, vec4(0.0), vec4(1.0));
    color = vec4(color.rgb * color.a, color.a);
  }
  fragColor = color;
}`;

function compileSpriteBatchShader(gl: WebGL2RenderingContext): WebGLQuadBatchShader {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, QUAD_BATCH_VS);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, QUAD_BATCH_FS);
  gl.compileShader(fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return {
    program,
    locCorner: gl.getAttribLocation(program, 'a_corner'),
    locMatAB: 1,
    locMatCD: 2,
    locMatTXTY: 3,
    locSize: 4,
    locUVRect: 5,
    locAlpha: 6,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locHasColorTransform: gl.getUniformLocation(program, 'u_hasCT'),
    locColorMultiplier: gl.getUniformLocation(program, 'u_ctMult'),
    locColorOffset: gl.getUniformLocation(program, 'u_ctOff'),
  };
}

export function ensureWebGLQuadBatchShader(state: WebGLRenderStateInternal): WebGLQuadBatchShader {
  if (state.quadBatchShader) return state.quadBatchShader;

  const gl = state.gl;
  state.quadBatchShader = compileSpriteBatchShader(gl);

  const cornerData = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);
  state.quadBatchCornerBuffer = cornerBuf;

  return state.quadBatchShader;
}

export function flushWebGLSpriteBatch(state: WebGLRenderStateInternal): void {
  const count = state.spriteBatchCount;
  if (count === 0) return;

  const texture = state.spriteBatchTexture!;
  const blendMode = state.spriteBatchBlendMode;
  const colorTransform = state.spriteBatchColorTransform;
  state.spriteBatchCount = 0;
  state.spriteBatchTexture = null;
  state.spriteBatchBlendMode = null;
  state.spriteBatchColorTransform = null;

  ensureWebGLQuadBatchShader(state);

  const gl = state.gl;

  if (state.spriteBatchInstanceBuffer === null) {
    state.spriteBatchInstanceBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, state.spriteBatchInstanceData.byteLength, gl.DYNAMIC_DRAW);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchInstanceBuffer);
  }

  gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.spriteBatchInstanceData, 0, count * SPRITE_INSTANCE_FLOATS);

  state.applyBlendMode?.(state, blendMode);
  bindWebGLTexture(state, texture);

  const shader = state.quadBatchShader!;
  if (state.currentProgram !== shader.program) {
    gl.useProgram(shader.program);
    state.currentProgram = shader.program;
  }

  const viewport = state.renderTargetViewport ?? state.canvas;
  const clipW = 2 / viewport.width;
  const clipH = 2 / viewport.height;
  const m = state.matrixArray;
  m[0] = clipW;
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;
  m[4] = -clipH;
  m[5] = 0;
  m[6] = -1;
  m[7] = 1;
  m[8] = 1;
  gl.uniformMatrix3fv(shader.locWorldMatrix, false, m);
  gl.uniform1i(shader.locTexture, 0);

  if (shader.locHasColorTransform !== null) {
    if (colorTransform !== null) {
      gl.uniform1i(shader.locHasColorTransform, 1);
      gl.uniform4f(
        shader.locColorMultiplier!,
        colorTransform.redMultiplier,
        colorTransform.greenMultiplier,
        colorTransform.blueMultiplier,
        colorTransform.alphaMultiplier,
      );
      gl.uniform4f(
        shader.locColorOffset!,
        colorTransform.redOffset / 255,
        colorTransform.greenOffset / 255,
        colorTransform.blueOffset / 255,
        colorTransform.alphaOffset / 255,
      );
    } else {
      gl.uniform1i(shader.locHasColorTransform, 0);
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBatchCornerBuffer!);
  gl.enableVertexAttribArray(shader.locCorner);
  gl.vertexAttribPointer(shader.locCorner, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(shader.locCorner, 0);

  const stride = SPRITE_INSTANCE_STRIDE;
  gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchInstanceBuffer!);

  gl.enableVertexAttribArray(shader.locMatAB);
  gl.vertexAttribPointer(shader.locMatAB, 2, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(shader.locMatAB, 1);

  gl.enableVertexAttribArray(shader.locMatCD);
  gl.vertexAttribPointer(shader.locMatCD, 2, gl.FLOAT, false, stride, 8);
  gl.vertexAttribDivisor(shader.locMatCD, 1);

  gl.enableVertexAttribArray(shader.locMatTXTY);
  gl.vertexAttribPointer(shader.locMatTXTY, 2, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(shader.locMatTXTY, 1);

  gl.enableVertexAttribArray(shader.locSize);
  gl.vertexAttribPointer(shader.locSize, 2, gl.FLOAT, false, stride, 24);
  gl.vertexAttribDivisor(shader.locSize, 1);

  gl.enableVertexAttribArray(shader.locUVRect);
  gl.vertexAttribPointer(shader.locUVRect, 4, gl.FLOAT, false, stride, 32);
  gl.vertexAttribDivisor(shader.locUVRect, 1);

  gl.enableVertexAttribArray(shader.locAlpha);
  gl.vertexAttribPointer(shader.locAlpha, 1, gl.FLOAT, false, stride, 48);
  gl.vertexAttribDivisor(shader.locAlpha, 1);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.quadIndexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);

  gl.vertexAttribDivisor(shader.locMatAB, 0);
  gl.vertexAttribDivisor(shader.locMatCD, 0);
  gl.vertexAttribDivisor(shader.locMatTXTY, 0);
  gl.vertexAttribDivisor(shader.locSize, 0);
  gl.vertexAttribDivisor(shader.locUVRect, 0);
  gl.vertexAttribDivisor(shader.locAlpha, 0);
}

// Ensures the sprite batch can accept up to `maxInstances` additional instances for the given
// texture, blend mode, and color transform. Flushes the current batch if the key changes or
// capacity is exceeded. Returns the float index in spriteBatchInstanceData where the caller
// should begin writing. Caller is responsible for incrementing state.spriteBatchCount.
export function prepareWebGLSpriteBatchWrite(
  state: WebGLRenderStateInternal,
  texture: CanvasImageSource,
  blendMode: BlendMode | null,
  colorTransform: ColorTransform | null,
  maxInstances: number,
): number {
  if (
    texture !== state.spriteBatchTexture ||
    blendMode !== state.spriteBatchBlendMode ||
    colorTransform !== state.spriteBatchColorTransform
  ) {
    flushWebGLSpriteBatch(state);
  }
  state.spriteBatchTexture = texture;
  state.spriteBatchBlendMode = blendMode;
  state.spriteBatchColorTransform = colorTransform;

  const needed = (state.spriteBatchCount + maxInstances) * SPRITE_INSTANCE_FLOATS;
  if (needed > state.spriteBatchInstanceData.length) {
    const newSize = Math.max(needed, state.spriteBatchInstanceData.length * 2);
    state.spriteBatchInstanceData = new Float32Array(newSize);
    if (state.spriteBatchInstanceBuffer !== null) {
      const gl = state.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
    }
  }

  return state.spriteBatchCount * SPRITE_INSTANCE_FLOATS;
}
