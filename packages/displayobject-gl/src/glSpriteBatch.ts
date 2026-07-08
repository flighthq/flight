import { bindGlTexture } from '@flighthq/render-gl';
import { createGlProgram } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { BlendMode, GlMaterialRenderer, GlRenderState, Material, MaterialData } from '@flighthq/types';
import type { GlQuadBatchShader } from '@flighthq/types';

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

export const QUAD_BATCH_VS = `#version 300 es
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
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord) * clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  fragColor = color;
}`;

function compileSpriteBatchShader(gl: WebGL2RenderingContext): GlQuadBatchShader {
  const program = createGlProgram(gl, QUAD_BATCH_VS, QUAD_BATCH_FS, 'Sprite-batch');
  return {
    program,
    locCorner: 0,
    locMatAB: 1,
    locMatCD: 2,
    locMatTXTY: 3,
    locSize: 4,
    locUvRect: 5,
    locAlpha: 6,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
  };
}

// Binds the corner buffer (location `locCorner`, divisor 0) and the base instance attributes
// (locations 1-6, divisor 1) from the active sprite-batch instance buffer. Shared by every
// sprite-batch material renderer regardless of its program, since the base layout is fixed.
export function bindGlQuadBatchBaseAttributes(state: GlRenderState, locCorner: number): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.quadBatchCornerBuffer!);
  gl.enableVertexAttribArray(locCorner);
  gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(locCorner, 0);

  const stride = SPRITE_INSTANCE_STRIDE;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceBuffer!);
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

export function ensureGlQuadBatchShader(state: GlRenderState): GlQuadBatchShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.quadBatchShader) return runtime.quadBatchShader;

  const gl = state.gl;
  runtime.quadBatchShader = compileSpriteBatchShader(gl);

  const cornerData = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);
  runtime.quadBatchCornerBuffer = cornerBuf;

  return runtime.quadBatchShader;
}

export function flushGlSpriteBatch(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const count = runtime.spriteBatchCount;
  if (count === 0) return;

  const texture = runtime.spriteBatchTexture!;
  const blendMode = runtime.spriteBatchBlendMode;
  const material = runtime.spriteBatchMaterial;
  const renderer = runtime.spriteBatchMaterialRenderer!;
  const floats = runtime.spriteBatchMaterialFloats;
  runtime.spriteBatchCount = 0;
  runtime.spriteBatchTexture = null;
  runtime.spriteBatchBlendMode = null;
  runtime.spriteBatchMaterial = null;
  runtime.spriteBatchMaterialRenderer = null;
  runtime.spriteBatchMaterialFloats = 0;

  const gl = state.gl;

  if (runtime.spriteBatchInstanceBuffer === null) {
    runtime.spriteBatchInstanceBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceData.byteLength, gl.DYNAMIC_DRAW);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceBuffer);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, runtime.spriteBatchInstanceData, 0, count * SPRITE_INSTANCE_FLOATS);

  if (floats > 0) {
    if (runtime.spriteBatchMaterialBuffer === null) {
      runtime.spriteBatchMaterialBuffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialData.byteLength, gl.DYNAMIC_DRAW);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialBuffer);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, runtime.spriteBatchMaterialData, 0, count * floats);
  }

  state.applyBlendMode?.(state, blendMode);
  bindGlTexture(state, texture);

  // Resolved renderer owns program selection, uniforms, and all attribute setup (base + its own).
  renderer.bind(state, material);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, runtime.quadIndexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);

  for (let loc = 1; loc <= MAX_INSTANCE_ATTRIB_LOCATION; loc++) {
    gl.vertexAttribDivisor(loc, 0);
  }
}

// Writes one instance's per-instance material floats into the active material buffer at the given
// instance index, converting the supplied per-instance materialData. No-op for uniform-only
// materials (no packInstance / floats === 0).
export function packGlSpriteBatchMaterialInstance(
  state: GlRenderState,
  materialData: MaterialData | null,
  instanceIndex: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const renderer = runtime.spriteBatchMaterialRenderer;
  if (renderer === null || renderer.packInstance === undefined) return;
  renderer.packInstance(
    state,
    materialData,
    runtime.spriteBatchMaterialData,
    instanceIndex * runtime.spriteBatchMaterialFloats,
  );
}

// Ensures the sprite batch can accept up to `maxInstances` more instances for the given texture,
// blend mode, and material. Flushes the current batch when any of the three changes (material is
// compared by reference) or capacity is exceeded. Returns the float index in
// spriteBatchInstanceData where the caller should begin writing base instance data; the caller
// increments state.spriteBatchCount and calls packGlSpriteBatchMaterialInstance per instance.
export function prepareGlSpriteBatchWrite(
  state: GlRenderState,
  texture: CanvasImageSource,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: GlMaterialRenderer,
  maxInstances: number,
): number {
  const runtime = getGlRenderStateRuntime(state);
  if (
    texture !== runtime.spriteBatchTexture ||
    blendMode !== runtime.spriteBatchBlendMode ||
    material !== runtime.spriteBatchMaterial
  ) {
    flushGlSpriteBatch(state);
  }
  runtime.spriteBatchTexture = texture;
  runtime.spriteBatchBlendMode = blendMode;
  runtime.spriteBatchMaterial = material;
  runtime.spriteBatchMaterialRenderer = materialRenderer;
  const floats = materialRenderer.instanceFloatCount;
  runtime.spriteBatchMaterialFloats = floats;

  const needed = (runtime.spriteBatchCount + maxInstances) * SPRITE_INSTANCE_FLOATS;
  if (needed > runtime.spriteBatchInstanceData.length) {
    const newSize = Math.max(needed, runtime.spriteBatchInstanceData.length * 2);
    runtime.spriteBatchInstanceData = new Float32Array(newSize);
    if (runtime.spriteBatchInstanceBuffer !== null) {
      const gl = state.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
    }
  }

  if (floats > 0) {
    const materialNeeded = (runtime.spriteBatchCount + maxInstances) * floats;
    if (materialNeeded > runtime.spriteBatchMaterialData.length) {
      const newSize = Math.max(materialNeeded, runtime.spriteBatchMaterialData.length * 2);
      runtime.spriteBatchMaterialData = new Float32Array(newSize);
      if (runtime.spriteBatchMaterialBuffer !== null) {
        const gl = state.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
      }
    }
  }

  return runtime.spriteBatchCount * SPRITE_INSTANCE_FLOATS;
}

export function setGlQuadBatchWorldAndTexture(
  state: GlRenderState,
  locWorldMatrix: WebGLUniformLocation,
  locTexture: WebGLUniformLocation,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const viewport = runtime.renderTargetViewport ?? state.canvas;
  const clipW = 2 / viewport.width;
  const clipH = 2 / viewport.height;
  const m = runtime.matrixArray;
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

export function useGlQuadBatchProgram(state: GlRenderState, program: WebGLProgram): void {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.currentProgram !== program) {
    state.gl.useProgram(program);
    runtime.currentProgram = program;
  }
}
