import { applyGlSamplerState } from '@flighthq/render-gl/contract';
import { bindGlTextureRealization } from '@flighthq/render-gl/contract';
import { createGlProgram } from '@flighthq/render-gl/contract';
import { getGlColorAdjustmentMaterialFeature } from '@flighthq/render-gl/contract';
import { getGlColorAdjustmentMaterialFeatureGuard } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type {
  GlContext,
  BlendMode,
  ColorScaleBias,
  TintMaterialData,
  GlMaterialRenderer,
  GlQuadBatchShader,
  GlRenderState,
  Material,
  MaterialData,
  SamplerLike,
} from '@flighthq/types/contract';

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
const QUAD_BATCH_INSTANCE_FLOATS = 13;
const QUAD_BATCH_INSTANCE_STRIDE = QUAD_BATCH_INSTANCE_FLOATS * 4;

// Highest per-instance attribute location any quad-batch writer material or the opt-in color-adjustment
// fold (a_colorScale/a_colorBias at 7/8) may use. Divisors for locations 1..this are reset after each flush so
// later non-instanced draws are not corrupted.
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
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  fragColor = color;
}`;

function compileQuadBatchWriterShader(gl: GlContext): GlQuadBatchShader {
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
    locStraightTextureAlpha: gl.getUniformLocation(program, 'u_straightTextureAlpha')!,
  };
}

// Binds the corner buffer (location `locCorner`, divisor 0) and the base instance attributes
// (locations 1-6, divisor 1) from the active quad-batch writer instance buffer. Shared by every
// quad-batch writer material renderer regardless of its program, since the base layout is fixed.
export function bindGlQuadBatchBaseAttributes(state: GlRenderState, locCorner: number): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadBatchResources!.cornerBuffer);
  gl.enableVertexAttribArray(locCorner);
  gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(locCorner, 0);

  const stride = QUAD_BATCH_INSTANCE_STRIDE;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadBatchResources!.writerInstanceBuffer!);
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
  if (runtime.context.quadBatchResources) return runtime.context.quadBatchResources.shader;

  const gl = state.gl;
  const shader = compileQuadBatchWriterShader(gl);

  const cornerData = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cornerData, gl.STATIC_DRAW);
  runtime.context.quadBatchResources = {
    cornerBuffer: cornerBuf,
    shader,
    writerColorScaleBiasBuffer: null,
    writerInstanceBuffer: null,
    writerMaterialBuffer: null,
  };

  return shader;
}

export function flushGlQuadBatchWriter(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const count = runtime.quadBatchWriterCount;
  if (count === 0) return;

  const texture = runtime.quadBatchWriterTexture!;
  const sampler = runtime.quadBatchWriterSampler;
  const straightAlpha = runtime.quadBatchWriterStraightAlpha;
  const blendMode = runtime.quadBatchWriterBlendMode;
  const material = runtime.quadBatchWriterMaterial;
  const renderer = runtime.quadBatchWriterMaterialRenderer!;
  const floats = runtime.quadBatchWriterMaterialFloats;
  const smoothing = runtime.quadBatchWriterSmoothing;
  runtime.quadBatchWriterCount = 0;
  runtime.quadBatchWriterTexture = null;
  runtime.quadBatchWriterSampler = null;
  runtime.quadBatchWriterStraightAlpha = false;
  runtime.quadBatchWriterSmoothing = null;
  runtime.quadBatchWriterBlendMode = null;
  runtime.quadBatchWriterMaterial = null;
  runtime.quadBatchWriterMaterialRenderer = null;
  runtime.quadBatchWriterMaterialFloats = 0;

  const gl = state.gl;

  const qbr = runtime.context.quadBatchResources!;
  if (qbr.writerInstanceBuffer === null) {
    qbr.writerInstanceBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, runtime.quadBatchWriterInstanceData.byteLength, gl.DYNAMIC_DRAW);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerInstanceBuffer);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, runtime.quadBatchWriterInstanceData, 0, count * QUAD_BATCH_INSTANCE_FLOATS);

  state.applyBlendMode?.(state, blendMode);
  bindGlTextureRealization(state, { straightAlpha, texture });
  applyGlSamplerState(state, runtime, texture, sampler, smoothing);

  // The color-adjustment fold is opt-in (registerGlColorAdjustmentMaterialFeature): when installed it selects and binds
  // its program for a tinted batch, returning true; when absent, or for an untinted batch, the lean
  // material path runs and no fold code is linked into this module.
  const ctHandled = getGlColorAdjustmentMaterialFeature(state)?.flush(state, count) ?? false;
  if (!ctHandled) {
    if (floats > 0) {
      if (qbr.writerMaterialBuffer === null) {
        qbr.writerMaterialBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerMaterialBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, runtime.quadBatchWriterMaterialData.byteLength, gl.DYNAMIC_DRAW);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerMaterialBuffer);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, runtime.quadBatchWriterMaterialData, 0, count * floats);
    }
    // Resolved renderer owns program selection, uniforms, and all attribute setup (base + its own).
    renderer.bind(state, material);
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, runtime.context.quadIndexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);

  for (let loc = 1; loc <= MAX_INSTANCE_ATTRIB_LOCATION; loc++) {
    gl.vertexAttribDivisor(loc, 0);
  }
}

// Writes one instance's per-instance material floats into the active material buffer at the given
// instance index, converting the supplied per-instance materialData. No-op for uniform-only
// materials (no packInstance / floats === 0). Color transform is folded separately by
// recordGlQuadBatchColorScaleBias — it is not a material.
export function packGlQuadBatchMaterialInstance(
  state: GlRenderState,
  materialData: MaterialData | null,
  instanceIndex: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const renderer = runtime.quadBatchWriterMaterialRenderer;
  if (renderer === null || renderer.packInstance === undefined) return;
  renderer.packInstance(
    state,
    materialData,
    runtime.quadBatchWriterMaterialData,
    instanceIndex * runtime.quadBatchWriterMaterialFloats,
  );
}

// Ensures the quad-batch writer can accept up to `maxInstances` more instances for the given texture,
// blend mode, material, and smoothing. Flushes the current batch when any of the four changes (material
// is compared by reference) or capacity is exceeded. `smoothing` is a per-bitmap sampling preference
// (`true`/`false` force LINEAR/NEAREST, `null` uses the global `allowSmoothing` default); it keys the
// batch because filtering is a per-texture-bind property. The color adjustment is orthogonal — it never
// keys the batch. Returns the float index in quadBatchWriterInstanceData where the caller should begin
// writing base instance data; the caller increments state.quadBatchWriterCount and records per-instance data.
export function prepareGlQuadBatchWrite(
  state: GlRenderState,
  texture: WebGLTexture,
  straightAlpha: boolean,
  sampler: Readonly<SamplerLike> | null,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: GlMaterialRenderer,
  maxInstances: number,
  smoothing: boolean | null = null,
): number {
  const runtime = getGlRenderStateRuntime(state);
  runtime.flushPendingDraws = flushGlQuadBatchWriter;
  if (
    texture !== runtime.quadBatchWriterTexture ||
    straightAlpha !== runtime.quadBatchWriterStraightAlpha ||
    sampler !== runtime.quadBatchWriterSampler ||
    blendMode !== runtime.quadBatchWriterBlendMode ||
    material !== runtime.quadBatchWriterMaterial ||
    smoothing !== runtime.quadBatchWriterSmoothing
  ) {
    flushGlQuadBatchWriter(state);
  }
  runtime.quadBatchWriterTexture = texture;
  runtime.quadBatchWriterSampler = sampler;
  runtime.quadBatchWriterStraightAlpha = straightAlpha;
  runtime.quadBatchWriterSmoothing = smoothing;
  runtime.quadBatchWriterBlendMode = blendMode;
  runtime.quadBatchWriterMaterial = material;
  runtime.quadBatchWriterMaterialRenderer = materialRenderer;
  const floats = materialRenderer.instanceFloatCount;
  runtime.quadBatchWriterMaterialFloats = floats;

  const needed = (runtime.quadBatchWriterCount + maxInstances) * QUAD_BATCH_INSTANCE_FLOATS;
  if (needed > runtime.quadBatchWriterInstanceData.length) {
    const newSize = Math.max(needed, runtime.quadBatchWriterInstanceData.length * 2);
    runtime.quadBatchWriterInstanceData = new Float32Array(newSize);
    if (runtime.context.quadBatchResources!.writerInstanceBuffer !== null) {
      const gl = state.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadBatchResources!.writerInstanceBuffer!);
      gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
    }
  }

  if (floats > 0) {
    const materialNeeded = (runtime.quadBatchWriterCount + maxInstances) * floats;
    if (materialNeeded > runtime.quadBatchWriterMaterialData.length) {
      const newSize = Math.max(materialNeeded, runtime.quadBatchWriterMaterialData.length * 2);
      runtime.quadBatchWriterMaterialData = new Float32Array(newSize);
      if (runtime.context.quadBatchResources!.writerMaterialBuffer !== null) {
        const gl = state.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadBatchResources!.writerMaterialBuffer!);
        gl.bufferData(gl.ARRAY_BUFFER, newSize * 4, gl.DYNAMIC_DRAW);
      }
    }
  }

  return runtime.quadBatchWriterCount * QUAD_BATCH_INSTANCE_FLOATS;
}

// Folds instance `instanceIndex`'s effective color adjustment into the active batch through the opt-in
// color-adjustment fold, without ever splitting the batch. When the capability was not enabled
// (registerGlColorAdjustmentMaterialFeature), the fold slot is null and the tint is skipped — the batch draws untinted
// (the sentinel behavior); an installed guard reports the miss. `colorScaleBias` is null for an
// untinted instance, which is a no-op whether or not the fold is enabled.
export function recordGlQuadBatchColorScaleBias(
  state: GlRenderState,
  colorScaleBias: ColorScaleBias | TintMaterialData | readonly number[] | null | undefined,
  instanceIndex: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const fold = getGlColorAdjustmentMaterialFeature(state);
  if (fold != null) {
    fold.record(runtime, colorScaleBias, instanceIndex);
    return;
  }
  if (colorScaleBias != null) getGlColorAdjustmentMaterialFeatureGuard(state)?.(state, colorScaleBias);
}

export function setGlQuadBatchWorldAndTexture(
  state: GlRenderState,
  locWorldMatrix: WebGLUniformLocation,
  locTexture: WebGLUniformLocation,
  locStraightTextureAlpha?: WebGLUniformLocation,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const viewportWidth = runtime.renderTargetViewport?.width ?? gl.drawingBufferWidth;
  const viewportHeight = runtime.renderTargetViewport?.height ?? gl.drawingBufferHeight;
  const clipW = 2 / viewportWidth;
  const clipH = 2 / viewportHeight;
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
  if (locStraightTextureAlpha !== undefined) {
    gl.uniform1i(locStraightTextureAlpha, runtime.context.currentTextureRealization?.straightAlpha === true ? 1 : 0);
  }
}

export function useGlQuadBatchProgram(state: GlRenderState, program: WebGLProgram): void {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.context.currentShader?.program !== program) {
    state.gl.useProgram(program);
  }
  runtime.context.currentShader = { locations: null, program };
}
