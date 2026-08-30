import { createGlProgram } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime, resolveGlTexture } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getTextureHeight, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type {
  GlContext,
  GlRenderState,
  ParticleEmitter2D,
  RenderProxy2D,
  SpriteRenderer,
} from '@flighthq/types/contract';
import type { GlParticleShader } from '@flighthq/types/contract';

import { flushGlQuadBatchWriter } from './glQuadBatchWriter';

// Per-instance layout (14 floats = 56 bytes):
// [0]  px         float
// [1]  py         float
// [2]  cosScale   float
// [3]  sinScale   float
// [4]  r          float
// [5]  g          float
// [6]  b          float
// [7]  alpha      float
// [8]  u0         float
// [9]  v0         float
// [10] u1         float
// [11] v1         float
// [12] width      float
// [13] height     float
const INSTANCE_FLOATS = 14;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // bytes

const PARTICLE_VS = `#version 300 es
precision mediump float;

in vec2 a_corner;

layout(location = 1) in vec2  a_pos;
layout(location = 2) in float a_cosScale;
layout(location = 3) in float a_sinScale;
layout(location = 4) in vec4  a_color;
layout(location = 5) in vec4  a_uvRect;
layout(location = 6) in vec2  a_size;

uniform mat3 u_world;

out vec2 v_uv;
out vec4 v_color;

void main() {
  float lx = a_corner.x * a_size.x;
  float ly = a_corner.y * a_size.y;
  float rx = a_cosScale * lx - a_sinScale * ly + a_pos.x;
  float ry = a_sinScale * lx + a_cosScale * ly + a_pos.y;
  vec3 clip = u_world * vec3(rx, ry, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  v_uv    = mix(a_uvRect.xy, a_uvRect.zw, a_corner);
  v_color = a_color;
}`;

// Premultiplied-alpha tint: tex.rgb is already multiplied by tex.a, so the
// correct tinted premultiplied output is (tex.rgb * color.rgb * alpha, tex.a * alpha).
const PARTICLE_FS = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;

out vec4 fragColor;

void main() {
  vec4 tex = texture(u_texture, v_uv);
  if (u_straightTextureAlpha) tex.rgb *= tex.a;
  fragColor = vec4(tex.rgb * v_color.rgb, tex.a) * v_color.a;
  if (fragColor.a <= 0.0) discard;
}`;

function compileParticleShader(gl: GlContext): GlParticleShader {
  const program = createGlProgram(gl, PARTICLE_VS, PARTICLE_FS, 'Particle emitter');
  return {
    program,
    locCorner: gl.getAttribLocation(program, 'a_corner'),
    locPos: 1, // layout(location = 1)
    locCosScale: 2,
    locSinScale: 3,
    locColor: 4,
    locUvRect: 5,
    locSize: 6,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locStraightTextureAlpha: gl.getUniformLocation(program, 'u_straightTextureAlpha')!,
  };
}

function ensureParticleShader(state: GlRenderState): GlParticleShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.context.particleResources) return runtime.context.particleResources.shader;

  const gl = state.gl;
  const shader = compileParticleShader(gl);

  // Static corner buffer: (0,0),(1,0),(1,1),(0,1)
  const cornerData = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);

  // Dynamic instance buffer — starts empty, grows as needed
  runtime.context.particleResources = {
    cornerBuffer: cornerBuf,
    instanceBuffer: gl.createBuffer()!,
    shader,
  };
  runtime.particleInstanceData = new Float32Array(0);

  return shader;
}

function ensureInstanceCapacity(state: GlRenderState, count: number): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const needed = count * INSTANCE_FLOATS;
  if ((runtime.particleInstanceData?.length ?? 0) >= needed) return;
  // Double capacity each time.
  const newSize = Math.max(needed, (runtime.particleInstanceData?.length ?? 0) * 2);
  runtime.particleInstanceData = new Float32Array(newSize);
  // Resize GPU buffer to match.
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.particleResources!.instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
}

export function drawGlParticleEmitter2D(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as ParticleEmitter2D;
  const { atlas, alphas, colors, ids, particleCount, transforms } = source.data;
  if (atlas === null || atlas.texture === null || !hasTextureSource(atlas.texture) || particleCount === 0) return;

  const shader = ensureParticleShader(state);
  ensureInstanceCapacity(state, particleCount);

  state.applyBlendMode?.(state, renderProxy.blendMode);
  if (resolveGlTexture(state, atlas.texture, true, SCENE2D_WORKING_COLOR_SPACE) === null) return;

  const gl = state.gl;
  const regions = atlas.regions;
  const numRegions = regions.length;
  const nodeAlpha = renderProxy.alpha;
  const t = renderProxy.transform2D;
  const viewportWidth = runtime.renderTargetViewport?.width ?? gl.drawingBufferWidth;
  const viewportHeight = runtime.renderTargetViewport?.height ?? gl.drawingBufferHeight;
  const iw = 1 / Math.max(1, getTextureWidth(atlas.texture));
  const ih = 1 / Math.max(1, getTextureHeight(atlas.texture));
  const instanceData = runtime.particleInstanceData!;

  // Build per-instance CPU buffer.
  let base = 0;
  let drawCount = 0;
  for (let i = 0; i < particleCount; i++) {
    const id = ids[i];
    if (id < 0 || id >= numRegions) continue;
    const region = regions[id];
    if (region.width <= 0 || region.height <= 0) continue;

    const tt = i * 4;
    const px = transforms[tt];
    const py = transforms[tt + 1];
    const rotation = transforms[tt + 2];
    const scale = transforms[tt + 3];
    const cosR = Math.cos(rotation) * scale;
    const sinR = Math.sin(rotation) * scale;

    // Fold the emitter node transform into cosScale/sinScale and pos.
    // particle local → emitter world (then clip via u_world).
    // Full composition would need to pass the raw particle params and apply
    // the node transform in the shader via u_world. We do exactly that:
    // u_world encodes (t × viewport projection), so we pass raw local coords.
    const ct = i * 3;
    const hasColors = colors != null && colors.length > ct + 2;
    const r = hasColors ? colors[ct] : 1;
    const g = hasColors ? colors[ct + 1] : 1;
    const b = hasColors ? colors[ct + 2] : 1;

    instanceData[base] = px;
    instanceData[base + 1] = py;
    instanceData[base + 2] = cosR;
    instanceData[base + 3] = sinR;
    instanceData[base + 4] = r;
    instanceData[base + 5] = g;
    instanceData[base + 6] = b;
    instanceData[base + 7] = nodeAlpha * alphas[i];
    instanceData[base + 8] = region.x * iw;
    instanceData[base + 9] = region.y * ih;
    instanceData[base + 10] = (region.x + region.width) * iw;
    instanceData[base + 11] = (region.y + region.height) * ih;
    instanceData[base + 12] = region.width;
    instanceData[base + 13] = region.height;
    base += INSTANCE_FLOATS;
    drawCount++;
  }

  if (drawCount === 0) return;

  // Upload instance data.
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.particleResources!.instanceBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData, 0, drawCount * INSTANCE_FLOATS);

  // Activate particle shader program.
  if (runtime.context.currentShader?.program !== shader.program) {
    gl.useProgram(shader.program);
  }
  runtime.context.currentShader = { locations: null, program: shader.program };

  // Compute and upload the emitter node → clip-space world matrix.
  // In world-space mode particle positions ARE already in world (pixel) space,
  // so we skip the node transform and map directly through the viewport.
  const clipW = 2 / viewportWidth;
  const clipH = 2 / viewportHeight;
  const m = runtime.matrixArray;
  if (source.data.worldSpace) {
    m[0] = clipW;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = -clipH;
    m[5] = 0;
    m[6] = -1;
    m[7] = 1;
    m[8] = 1;
  } else {
    m[0] = t.a * clipW;
    m[1] = -t.b * clipH;
    m[2] = 0;
    m[3] = t.c * clipW;
    m[4] = -t.d * clipH;
    m[5] = 0;
    m[6] = t.tx * clipW - 1;
    m[7] = -t.ty * clipH + 1;
    m[8] = 1;
  }
  gl.uniformMatrix3fv(shader.locWorldMatrix, false, m);
  gl.uniform1i(shader.locTexture, 0);
  gl.uniform1i(
    shader.locStraightTextureAlpha,
    runtime.context.currentTextureRealization?.straightAlpha === true ? 1 : 0,
  );

  // Per-vertex: corner buffer.
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.particleResources!.cornerBuffer);
  gl.enableVertexAttribArray(shader.locCorner);
  gl.vertexAttribPointer(shader.locCorner, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(shader.locCorner, 0);

  // Per-instance: instance buffer.
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.particleResources!.instanceBuffer);

  gl.enableVertexAttribArray(shader.locPos);
  gl.vertexAttribPointer(shader.locPos, 2, gl.FLOAT, false, INSTANCE_STRIDE, 0);
  gl.vertexAttribDivisor(shader.locPos, 1);

  gl.enableVertexAttribArray(shader.locCosScale);
  gl.vertexAttribPointer(shader.locCosScale, 1, gl.FLOAT, false, INSTANCE_STRIDE, 8);
  gl.vertexAttribDivisor(shader.locCosScale, 1);

  gl.enableVertexAttribArray(shader.locSinScale);
  gl.vertexAttribPointer(shader.locSinScale, 1, gl.FLOAT, false, INSTANCE_STRIDE, 12);
  gl.vertexAttribDivisor(shader.locSinScale, 1);

  gl.enableVertexAttribArray(shader.locColor);
  gl.vertexAttribPointer(shader.locColor, 4, gl.FLOAT, false, INSTANCE_STRIDE, 16);
  gl.vertexAttribDivisor(shader.locColor, 1);

  gl.enableVertexAttribArray(shader.locUvRect);
  gl.vertexAttribPointer(shader.locUvRect, 4, gl.FLOAT, false, INSTANCE_STRIDE, 32);
  gl.vertexAttribDivisor(shader.locUvRect, 1);

  gl.enableVertexAttribArray(shader.locSize);
  gl.vertexAttribPointer(shader.locSize, 2, gl.FLOAT, false, INSTANCE_STRIDE, 48);
  gl.vertexAttribDivisor(shader.locSize, 1);

  // Single draw call for all particles.
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, runtime.context.quadIndexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, drawCount);

  // Reset divisors so other renderers are not affected.
  gl.vertexAttribDivisor(shader.locPos, 0);
  gl.vertexAttribDivisor(shader.locCosScale, 0);
  gl.vertexAttribDivisor(shader.locSinScale, 0);
  gl.vertexAttribDivisor(shader.locColor, 0);
  gl.vertexAttribDivisor(shader.locUvRect, 0);
  gl.vertexAttribDivisor(shader.locSize, 0);
}

export const defaultGlParticleEmitter2DRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit(state: GlRenderState, node: RenderProxy2D): void {
    flushGlQuadBatchWriter(state);
    drawGlParticleEmitter2D(state, node);
  },
};
