import { noopRendererData } from '@flighthq/render';
import type { QuadBatch, RenderState, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import type { WebGLQuadBatchShader, WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture } from './webglDraw';

// Per-instance layout (12 floats = 48 bytes):
// [0-1]  a_matAB   (a, b)        — instance 2D matrix (identity for vector2 mode)
// [2-3]  a_matCD   (c, d)        — instance 2D matrix
// [4-5]  a_matTXTY (tx, ty)      — instance translation (dx,dy for vector2 mode)
// [6-7]  a_size    (w, h)        — region size in pixels
// [8-11] a_uvRect  (u0,v0,u1,v1) — atlas UV rect
const INSTANCE_FLOATS = 12;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

const QUAD_BATCH_VS = `#version 300 es
precision mediump float;

in vec2 a_corner;

layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec2 a_size;
layout(location = 5) in vec4 a_uvRect;

uniform mat3 u_world;

out vec2 v_texCoord;

void main() {
  vec2 local = a_corner * a_size;
  vec2 worldPos = vec2(
    a_matAB.x * local.x + a_matCD.x * local.y + a_matTXTY.x,
    a_matAB.y * local.x + a_matCD.y * local.y + a_matTXTY.y
  );
  vec3 clip = u_world * vec3(worldPos, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_texCoord = mix(a_uvRect.xy, a_uvRect.zw, a_corner);
}`;

const QUAD_BATCH_FS = `#version 300 es
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

function compileQuadBatchShader(gl: WebGL2RenderingContext): WebGLQuadBatchShader {
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
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locAlpha: gl.getUniformLocation(program, 'u_alpha')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
  };
}

export function drawWebGLQuadBatch(state: RenderState, quadBatch: SpriteRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = quadBatch.source as QuadBatch;
  const data = source.data;
  const { atlas, instanceCount, ids, transforms } = data;
  if (atlas === null || atlas.image === null || atlas.image.src === null || instanceCount === 0) return;

  ensureWebGLQuadBatchShader(internal);
  ensureWebGLQuadBatchCapacity(internal, instanceCount);

  internal.applyBlendMode?.(internal, quadBatch.blendMode);
  bindWebGLTexture(internal, atlas.image.src);

  const regions = atlas.regions;
  const numRegions = regions.length;
  const iw = 1 / (atlas.image.width || 1);
  const ih = 1 / (atlas.image.height || 1);
  const instanceData = internal.quadBatchInstanceData!;
  const isVector2 = data.transformType === 'vector2';

  let base = 0;
  let drawCount = 0;
  for (let i = 0; i < instanceCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) continue;

    if (isVector2) {
      const offset = i * 2;
      instanceData[base] = 1;
      instanceData[base + 1] = 0;
      instanceData[base + 2] = 0;
      instanceData[base + 3] = 1;
      instanceData[base + 4] = transforms[offset];
      instanceData[base + 5] = transforms[offset + 1];
    } else {
      const offset = i * 6;
      instanceData[base] = transforms[offset];
      instanceData[base + 1] = transforms[offset + 1];
      instanceData[base + 2] = transforms[offset + 2];
      instanceData[base + 3] = transforms[offset + 3];
      instanceData[base + 4] = transforms[offset + 4];
      instanceData[base + 5] = transforms[offset + 5];
    }
    instanceData[base + 6] = region.width;
    instanceData[base + 7] = region.height;
    instanceData[base + 8] = region.x * iw;
    instanceData[base + 9] = region.y * ih;
    instanceData[base + 10] = (region.x + region.width) * iw;
    instanceData[base + 11] = (region.y + region.height) * ih;
    base += INSTANCE_FLOATS;
    drawCount++;
  }

  if (drawCount === 0) return;

  drawWebGLQuadBatchInstanced(internal, drawCount, quadBatch.transform2D, quadBatch.alpha);
}

// Uploads the first drawCount instances from state.quadBatchInstanceData, sets up
// the quad batch shader and instanced draw call. Callers must invoke
// ensureWebGLQuadBatchShader and ensureWebGLQuadBatchCapacity first.
export function drawWebGLQuadBatchInstanced(
  state: WebGLRenderStateInternal,
  drawCount: number,
  transform: { a: number; b: number; c: number; d: number; tx: number; ty: number },
  alpha: number,
): void {
  const shader = state.quadBatchShader!;
  const gl = state.gl;

  gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBatchInstanceBuffer!);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.quadBatchInstanceData!, 0, drawCount * INSTANCE_FLOATS);

  if (state.currentProgram !== shader.program) {
    gl.useProgram(shader.program);
    state.currentProgram = shader.program;
  }

  const viewport = state.renderTargetViewport ?? state.canvas;
  const clipW = 2 / viewport.width;
  const clipH = 2 / viewport.height;
  const m = state.matrixArray;
  m[0] = transform.a * clipW;
  m[1] = -transform.b * clipH;
  m[2] = 0;
  m[3] = transform.c * clipW;
  m[4] = -transform.d * clipH;
  m[5] = 0;
  m[6] = transform.tx * clipW - 1;
  m[7] = -transform.ty * clipH + 1;
  m[8] = 1;
  gl.uniformMatrix3fv(shader.locWorldMatrix, false, m);
  gl.uniform1f(shader.locAlpha, alpha);
  gl.uniform1i(shader.locTexture, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBatchCornerBuffer!);
  gl.enableVertexAttribArray(shader.locCorner);
  gl.vertexAttribPointer(shader.locCorner, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(shader.locCorner, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, state.quadBatchInstanceBuffer!);

  gl.enableVertexAttribArray(shader.locMatAB);
  gl.vertexAttribPointer(shader.locMatAB, 2, gl.FLOAT, false, INSTANCE_STRIDE, 0);
  gl.vertexAttribDivisor(shader.locMatAB, 1);

  gl.enableVertexAttribArray(shader.locMatCD);
  gl.vertexAttribPointer(shader.locMatCD, 2, gl.FLOAT, false, INSTANCE_STRIDE, 8);
  gl.vertexAttribDivisor(shader.locMatCD, 1);

  gl.enableVertexAttribArray(shader.locMatTXTY);
  gl.vertexAttribPointer(shader.locMatTXTY, 2, gl.FLOAT, false, INSTANCE_STRIDE, 16);
  gl.vertexAttribDivisor(shader.locMatTXTY, 1);

  gl.enableVertexAttribArray(shader.locSize);
  gl.vertexAttribPointer(shader.locSize, 2, gl.FLOAT, false, INSTANCE_STRIDE, 24);
  gl.vertexAttribDivisor(shader.locSize, 1);

  gl.enableVertexAttribArray(shader.locUVRect);
  gl.vertexAttribPointer(shader.locUVRect, 4, gl.FLOAT, false, INSTANCE_STRIDE, 32);
  gl.vertexAttribDivisor(shader.locUVRect, 1);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.quadIndexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, drawCount);

  gl.vertexAttribDivisor(shader.locMatAB, 0);
  gl.vertexAttribDivisor(shader.locMatCD, 0);
  gl.vertexAttribDivisor(shader.locMatTXTY, 0);
  gl.vertexAttribDivisor(shader.locSize, 0);
  gl.vertexAttribDivisor(shader.locUVRect, 0);
}

export function ensureWebGLQuadBatchCapacity(state: WebGLRenderStateInternal, count: number): void {
  const needed = count * INSTANCE_FLOATS;
  if ((state.quadBatchInstanceData?.length ?? 0) >= needed) return;
  const newSize = Math.max(needed, (state.quadBatchInstanceData?.length ?? 0) * 2);
  state.quadBatchInstanceData = new Float32Array(newSize);
  state.gl.bindBuffer(state.gl.ARRAY_BUFFER, state.quadBatchInstanceBuffer!);
  state.gl.bufferData(state.gl.ARRAY_BUFFER, newSize * 4, state.gl.DYNAMIC_DRAW);
}

export function ensureWebGLQuadBatchShader(state: WebGLRenderStateInternal): WebGLQuadBatchShader {
  if (state.quadBatchShader) return state.quadBatchShader;

  const gl = state.gl;
  state.quadBatchShader = compileQuadBatchShader(gl);

  const cornerData = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);
  state.quadBatchCornerBuffer = cornerBuf;

  state.quadBatchInstanceBuffer = gl.createBuffer()!;
  state.quadBatchInstanceData = new Float32Array(0);

  return state.quadBatchShader;
}

export const defaultWebGLQuadBatchRenderer: SpriteRenderer = {
  createData: noopRendererData,
  draw: drawWebGLQuadBatch,
};
