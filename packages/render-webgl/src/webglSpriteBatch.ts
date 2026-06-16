import type { BlendMode, Material, MaterialData, WebGLMaterialRenderer } from '@flighthq/types';

import type { WebGLQuadBatchShader, WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture } from './webglDraw';

// Base per-instance layout (13 floats = 52 bytes, world-space transforms + per-instance alpha):
// [0-1]  a, b         — world-space 2D matrix column 1
// [2-3]  c, d         — world-space 2D matrix column 2
// [4-5]  tx, ty       — world-space translation
// [6-7]  width, height — region size in pixels
// [8-11] u0,v0,u1,v1  — atlas UV rect
// [12]   alpha        — per-instance alpha
// Attribute locations 0 (a_corner) and 1-6 are a fixed contract; material shaders extend from
// location 7. The base buffer and a material's own per-instance buffer share only the instance
// count and divisor convention.
const SPRITE_INSTANCE_FLOATS = 13;
const SPRITE_INSTANCE_STRIDE = SPRITE_INSTANCE_FLOATS * 4;

// Highest per-instance attribute location any sprite-batch material may use. Divisors for
// locations 1..this are reset after each flush so later non-instanced draws are not corrupted.
const MAX_INSTANCE_ATTRIB_LOCATION = 8;

const QUAD_BATCH_VS = `#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_corner;
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
    locCorner: 0,
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

// Binds the corner buffer (location `locCorner`, divisor 0) and the base instance attributes
// (locations 1-6, divisor 1) from the active sprite-batch instance buffer. Shared by every
// sprite-batch material renderer regardless of its program, since the base layout is fixed.
export function bindWebGLQuadBatchBaseAttributes(state: WebGLRenderStateInternal, locCorner: number): void {
  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBatchCornerBuffer!);
  gl.enableVertexAttribArray(locCorner);
  gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(locCorner, 0);

  const stride = SPRITE_INSTANCE_STRIDE;
  gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchInstanceBuffer!);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 8);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 24);
  gl.vertexAttribDivisor(4, 1);
  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 32);
  gl.vertexAttribDivisor(5, 1);
  gl.enableVertexAttribArray(6);
  gl.vertexAttribPointer(6, 1, gl.FLOAT, false, stride, 48);
  gl.vertexAttribDivisor(6, 1);
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
  const material = state.spriteBatchMaterial;
  const renderer = state.spriteBatchMaterialRenderer!;
  const floats = state.spriteBatchMaterialFloats;
  state.spriteBatchCount = 0;
  state.spriteBatchTexture = null;
  state.spriteBatchBlendMode = null;
  state.spriteBatchMaterial = null;
  state.spriteBatchMaterialRenderer = null;
  state.spriteBatchMaterialFloats = 0;

  const gl = state.gl;

  if (state.spriteBatchInstanceBuffer === null) {
    state.spriteBatchInstanceBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, state.spriteBatchInstanceData.byteLength, gl.DYNAMIC_DRAW);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchInstanceBuffer);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.spriteBatchInstanceData, 0, count * SPRITE_INSTANCE_FLOATS);

  if (floats > 0) {
    if (state.spriteBatchMaterialBuffer === null) {
      state.spriteBatchMaterialBuffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchMaterialBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, state.spriteBatchMaterialData.byteLength, gl.DYNAMIC_DRAW);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchMaterialBuffer);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.spriteBatchMaterialData, 0, count * floats);
  }

  state.applyBlendMode?.(state, blendMode);
  bindWebGLTexture(state, texture);

  // Resolved renderer owns program selection, uniforms, and all attribute setup (base + its own).
  renderer.bind(state, material);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.quadIndexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);

  for (let loc = 1; loc <= MAX_INSTANCE_ATTRIB_LOCATION; loc++) {
    gl.vertexAttribDivisor(loc, 0);
  }
}

// Writes one instance's per-instance material floats into the active material buffer at the given
// instance index, converting the supplied per-instance materialData. No-op for uniform-only
// materials (no packInstance / floats === 0).
export function packWebGLSpriteBatchMaterialInstance(
  state: WebGLRenderStateInternal,
  materialData: MaterialData | null,
  instanceIndex: number,
): void {
  const renderer = state.spriteBatchMaterialRenderer;
  if (renderer === null || renderer.packInstance === undefined) return;
  renderer.packInstance(
    state,
    materialData,
    state.spriteBatchMaterialData,
    instanceIndex * state.spriteBatchMaterialFloats,
  );
}

// Ensures the sprite batch can accept up to `maxInstances` more instances for the given texture,
// blend mode, and material. Flushes the current batch when any of the three changes (material is
// compared by reference) or capacity is exceeded. Returns the float index in
// spriteBatchInstanceData where the caller should begin writing base instance data; the caller
// increments state.spriteBatchCount and calls packWebGLSpriteBatchMaterialInstance per instance.
export function prepareWebGLSpriteBatchWrite(
  state: WebGLRenderStateInternal,
  texture: CanvasImageSource,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: WebGLMaterialRenderer,
  maxInstances: number,
): number {
  if (
    texture !== state.spriteBatchTexture ||
    blendMode !== state.spriteBatchBlendMode ||
    material !== state.spriteBatchMaterial
  ) {
    flushWebGLSpriteBatch(state);
  }
  state.spriteBatchTexture = texture;
  state.spriteBatchBlendMode = blendMode;
  state.spriteBatchMaterial = material;
  state.spriteBatchMaterialRenderer = materialRenderer;
  const floats = materialRenderer.instanceFloatCount;
  state.spriteBatchMaterialFloats = floats;

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

  if (floats > 0) {
    const materialNeeded = (state.spriteBatchCount + maxInstances) * floats;
    if (materialNeeded > state.spriteBatchMaterialData.length) {
      const newSize = Math.max(materialNeeded, state.spriteBatchMaterialData.length * 2);
      state.spriteBatchMaterialData = new Float32Array(newSize);
      if (state.spriteBatchMaterialBuffer !== null) {
        const gl = state.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBatchMaterialBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
      }
    }
  }

  return state.spriteBatchCount * SPRITE_INSTANCE_FLOATS;
}

export function setWebGLQuadBatchWorldAndTexture(
  state: WebGLRenderStateInternal,
  locWorldMatrix: WebGLUniformLocation,
  locTexture: WebGLUniformLocation,
): void {
  const gl = state.gl;
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
  gl.uniformMatrix3fv(locWorldMatrix, false, m);
  gl.uniform1i(locTexture, 0);
}

export function useWebGLQuadBatchProgram(state: WebGLRenderStateInternal, program: WebGLProgram): void {
  if (state.currentProgram !== program) {
    state.gl.useProgram(program);
    state.currentProgram = program;
  }
}
