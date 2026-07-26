import { createGlProgram } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type {
  ColorTransform,
  GlColorAdjustmentMaterialFeature,
  GlColorTransformInstancedShader,
  GlRenderState,
  GlRenderStateRuntime,
  GlShapeMesh,
  GlShapeMeshColorTransformShader,
  GlUniformColorTransformShader,
  RenderProxy2D,
  TintMaterialData,
} from '@flighthq/types';
import type { GlShapeMeshBinding } from '@flighthq/types';

import { drawGlShapeMeshBatch, ensureGlShapeMeshProgram } from './glShapeMesh';
import {
  bindGlQuadBatchBaseAttributes,
  QUAD_BATCH_VS,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glSpriteBatch';

// Enables the opt-in inline color-adjustment fold on a WebGL render state: the fused-color-matrix
// scene2d the sprite/quad batch draws through so a color transform (and, later, other pointwise
// adjustments) folds into the batch as data — a whole-batch uniform tint or per-instance
// a_ctMult/a_ctOff attributes, chosen by data cardinality — without ever splitting the batch. Until a
// state calls this, its batch renderer carries none of this module's shader code (it tree-shakes out)
// and recordGlSpriteBatchColorTransform silently skips every tint. Idempotent; safe to call per state.
export function registerGlColorAdjustmentMaterialFeature(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.glColorAdjustmentMaterialFeature = glColorAdjustmentMaterialFeature;
  if (runtime.spriteBatchColorTransformMode === undefined) runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
}

// Per-instance color-transform layout (8 floats = 32 bytes): 4 multiplier + 4 offset, at attribute
// locations 7 (a_ctMult) and 8 (a_ctOff). Used only when a batch carries varying tints (mode 2).
const COLOR_TRANSFORM_FLOATS = 8;
const COLOR_TRANSFORM_STRIDE = COLOR_TRANSFORM_FLOATS * 4;
const COLOR_MATRIX_FLOATS = 20;
const COLOR_MATRIX_STRIDE = COLOR_MATRIX_FLOATS * 4;

// Color-adjustment fold modes for the active sprite batch. NONE keeps the lean base shader; UNIFORM
// binds one whole-batch tint; PER_INSTANCE packs a tint per instance. A batch starts at NONE, rises to
// UNIFORM on the first tint, and promotes to PER_INSTANCE — back-filling already-written instances
// with the prior value/identity — when tints diverge, so a tint only ever promotes a batch, never
// splits it.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PACKED_TINT = 2;
const CT_MODE_PER_INSTANCE = 3;
const CT_MODE_MATRIX = 4;

type ColorAdjustmentData = ColorTransform | TintMaterialData | readonly number[];

// The backend's single color-adjustment shader chunk. The registered feature carries this source to
// every participating material compiler (Standard 2D and the promoted 3D family variants), so the
// color math has one implementation without making the lean base compilers statically import it.
const GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK = `
vec4 applyFlightColorAdjustment(vec4 color, vec4 multiplier, vec4 offset) {
  return clamp(color * multiplier + offset, vec4(0.0), vec4(1.0));
}
`;
const GL_COLOR_MATRIX_FRAGMENT_CHUNK = `
vec4 applyFlightColorMatrix(
  vec4 color,
  vec4 row0,
  vec4 row1,
  vec4 row2,
  vec4 row3,
  vec4 offset
) {
  return clamp(vec4(dot(row0, color), dot(row1, color), dot(row2, color), dot(row3, color)) + offset,
    vec4(0.0), vec4(1.0));
}
`;

// Per-instance color-transform program: the base quad-batch vertex work plus two vec4 instance
// attributes (a_ctMult / a_ctOff) carried through to the fragment scene2d. The color-transform math is
// applied in unpremultiplied space, matching the whole-batch uniform program byte for byte.
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

// The common varying-tint path: one normalized RGBA8 multiplier (4 bytes per instance), with no
// offset stream. It is widened to CT_INSTANCED_VS only if an affine transform with offsets appears.
const CT_PACKED_TINT_VS = `#version 300 es
precision mediump float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec2 a_size;
layout(location = 5) in vec4 a_uvRect;
layout(location = 6) in float a_alpha;
layout(location = 7) in vec4 a_ctMult;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;
out vec4 v_ctMult;

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
}`;

const CT_PACKED_TINT_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_ctMult;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
${GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, v_ctMult, vec4(0.0));
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

const CT_INSTANCED_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_ctMult;
in vec4 v_ctOff;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
${GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, v_ctMult, v_ctOff);
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

const CT_MATRIX_INSTANCED_VS = `#version 300 es
precision mediump float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_matAB;
layout(location = 2) in vec2 a_matCD;
layout(location = 3) in vec2 a_matTXTY;
layout(location = 4) in vec2 a_size;
layout(location = 5) in vec4 a_uvRect;
layout(location = 6) in float a_alpha;
layout(location = 7) in vec4 a_ctRow0;
layout(location = 8) in vec4 a_ctRow1;
layout(location = 9) in vec4 a_ctRow2;
layout(location = 10) in vec4 a_ctRow3;
layout(location = 11) in vec4 a_ctOff;
uniform mat3 u_world;
out vec2 v_texCoord;
out float v_alpha;
out vec4 v_ctRow0;
out vec4 v_ctRow1;
out vec4 v_ctRow2;
out vec4 v_ctRow3;
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
  v_ctRow0 = a_ctRow0;
  v_ctRow1 = a_ctRow1;
  v_ctRow2 = a_ctRow2;
  v_ctRow3 = a_ctRow3;
  v_ctOff = a_ctOff;
}`;

const CT_MATRIX_INSTANCED_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_ctRow0;
in vec4 v_ctRow1;
in vec4 v_ctRow2;
in vec4 v_ctRow3;
in vec4 v_ctOff;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
out vec4 fragColor;
${GL_COLOR_MATRIX_FRAGMENT_CHUNK}
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorMatrix(color, v_ctRow0, v_ctRow1, v_ctRow2, v_ctRow3, v_ctOff);
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

// Whole-batch color-transform fragment shader (over the base vertex shader): one tint uploaded as
// u_ctMult/u_ctOff uniforms and shared by every instance. This is the uniform path — a single tint on
// a whole batch (e.g. a bitmap-text node) costs no per-instance data.
const UNIFORM_CT_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
uniform vec4 u_ctMult;
uniform vec4 u_ctOff;
out vec4 fragColor;
${GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, u_ctMult, u_ctOff);
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

// Binds the whole-batch (uniform) color-transform program and uploads the shared tint. Base
// attributes come from the standard instance buffer; there is no per-instance tint data.
function bindGlSpriteBatchUniformColorTransform(
  state: GlRenderState,
  colorTransform: Readonly<ColorTransform | TintMaterialData>,
): void {
  const shader = ensureGlUniformColorTransformShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);

  const gl = state.gl;
  gl.uniform4f(
    shader.locColorMultiplier,
    getColorMultiplier(colorTransform, 0),
    getColorMultiplier(colorTransform, 1),
    getColorMultiplier(colorTransform, 2),
    getColorMultiplier(colorTransform, 3),
  );
  gl.uniform4f(
    shader.locColorOffset,
    getColorOffset(colorTransform, 0),
    getColorOffset(colorTransform, 1),
    getColorOffset(colorTransform, 2),
    getColorOffset(colorTransform, 3),
  );
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);
}

function bindGlSpriteBatchInstancedColorMatrix(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const shader = ensureGlColorMatrixInstancedShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);
  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer!);
  for (let attribute = 0; attribute < 5; attribute++) {
    const location = 7 + attribute;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, COLOR_MATRIX_STRIDE, attribute * 16);
    gl.vertexAttribDivisor(location, 1);
  }
}

// Binds the per-instance color-transform program and the a_ctMult/a_ctOff attribute stream from the
// batch's color-transform buffer, alongside the base instance attributes.
function bindGlSpriteBatchInstancedColorTransform(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const shader = ensureGlColorTransformInstancedShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);

  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer!);
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 4, gl.FLOAT, false, COLOR_TRANSFORM_STRIDE, 0);
  gl.vertexAttribDivisor(7, 1);
  gl.enableVertexAttribArray(8);
  gl.vertexAttribPointer(8, 4, gl.FLOAT, false, COLOR_TRANSFORM_STRIDE, 16);
  gl.vertexAttribDivisor(8, 1);
}

function bindGlSpriteBatchPackedTint(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const shader = ensureGlColorTintInstancedShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);

  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer!);
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 4, gl.UNSIGNED_BYTE, true, 4, 0);
  gl.vertexAttribDivisor(7, 1);
}

function ensureGlColorTransformInstancedShader(state: GlRenderState): GlColorTransformInstancedShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.colorTransformInstancedShader) return runtime.colorTransformInstancedShader;

  const gl = state.gl;
  const program = createGlProgram(gl, CT_INSTANCED_VS, CT_INSTANCED_FS, 'Sprite-batch color transform (per-instance)');
  runtime.colorTransformInstancedShader = {
    program,
    locCorner: 0,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locStraightTextureAlpha: gl.getUniformLocation(program, 'u_straightTextureAlpha')!,
  };
  return runtime.colorTransformInstancedShader;
}

function ensureGlColorMatrixInstancedShader(state: GlRenderState): GlColorTransformInstancedShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.colorMatrixInstancedShader) return runtime.colorMatrixInstancedShader;
  const gl = state.gl;
  const program = createGlProgram(gl, CT_MATRIX_INSTANCED_VS, CT_MATRIX_INSTANCED_FS, 'Sprite-batch color matrix');
  runtime.colorMatrixInstancedShader = {
    program,
    locCorner: 0,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locStraightTextureAlpha: gl.getUniformLocation(program, 'u_straightTextureAlpha')!,
  };
  return runtime.colorMatrixInstancedShader;
}

function ensureGlColorTintInstancedShader(state: GlRenderState): GlColorTransformInstancedShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.colorTintInstancedShader) return runtime.colorTintInstancedShader;

  const gl = state.gl;
  const program = createGlProgram(gl, CT_PACKED_TINT_VS, CT_PACKED_TINT_FS, 'Sprite-batch tint (RGBA8)');
  runtime.colorTintInstancedShader = {
    program,
    locCorner: 0,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locStraightTextureAlpha: gl.getUniformLocation(program, 'u_straightTextureAlpha')!,
  };
  return runtime.colorTintInstancedShader;
}

function ensureGlUniformColorTransformShader(state: GlRenderState): GlUniformColorTransformShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.uniformColorTransformShader) return runtime.uniformColorTransformShader;

  const gl = state.gl;
  const program = createGlProgram(gl, QUAD_BATCH_VS, UNIFORM_CT_FS, 'Sprite-batch color transform (uniform)');
  runtime.uniformColorTransformShader = {
    program,
    locCorner: 0,
    locWorldMatrix: gl.getUniformLocation(program, 'u_world')!,
    locTexture: gl.getUniformLocation(program, 'u_texture')!,
    locStraightTextureAlpha: gl.getUniformLocation(program, 'u_straightTextureAlpha')!,
    locColorMultiplier: gl.getUniformLocation(program, 'u_ctMult')!,
    locColorOffset: gl.getUniformLocation(program, 'u_ctOff')!,
  };
  return runtime.uniformColorTransformShader;
}

// Value equality for the whole-batch uniform check: reference-equal short-circuits (the common case —
// every glyph of a bitmap-text node shares one node-level tint), else compares all eight fields so a
// distinct-but-equal tint still keeps the batch on the cheaper uniform path.
function equalsRecordedColorTransform(
  a: Readonly<ColorAdjustmentData> | null,
  b: Readonly<ColorAdjustmentData> | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (isColorMatrixData(a) || isColorMatrixData(b)) {
    if (!isColorMatrixData(a) || !isColorMatrixData(b)) return false;
    for (let i = 0; i < COLOR_MATRIX_FLOATS; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  for (let channel = 0; channel < 4; channel++) {
    if (
      getColorMultiplier(a, channel) !== getColorMultiplier(b, channel) ||
      getColorOffset(a, channel) !== getColorOffset(b, channel)
    ) {
      return false;
    }
  }
  return true;
}

// Uploads the active batch's per-instance color-transform buffer, selects the fold program (uniform or
// per-instance), and binds it. Returns true when it drew a folded batch; false when the batch carried
// no tint, so flushGlSpriteBatch runs the lean material path instead. Resets the fold mode for the
// next batch.
function flushGlColorAdjustmentMaterialFeature(state: GlRenderState, count: number): boolean {
  const runtime = getGlRenderStateRuntime(state);
  const ctMode = runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE;
  if (ctMode === CT_MODE_NONE) return false;
  const uniformColorTransform = runtime.spriteBatchUniformColorTransform ?? null;
  runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  runtime.spriteBatchUniformColorTransform = null;

  if (ctMode === CT_MODE_PACKED_TINT) {
    const gl = state.gl;
    if (runtime.spriteBatchColorTransformBuffer == null) {
      runtime.spriteBatchColorTransformBuffer = gl.createBuffer()!;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, runtime.spriteBatchColorTintData!.subarray(0, count), gl.DYNAMIC_DRAW);
    bindGlSpriteBatchPackedTint(state);
    return true;
  }

  if (ctMode === CT_MODE_MATRIX) {
    const gl = state.gl;
    if (runtime.spriteBatchColorTransformBuffer == null) runtime.spriteBatchColorTransformBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      runtime.spriteBatchColorMatrixData!.subarray(0, count * COLOR_MATRIX_FLOATS),
      gl.DYNAMIC_DRAW,
    );
    bindGlSpriteBatchInstancedColorMatrix(state);
    return true;
  }

  if (ctMode === CT_MODE_PER_INSTANCE) {
    const gl = state.gl;
    if (runtime.spriteBatchColorTransformBuffer == null) {
      runtime.spriteBatchColorTransformBuffer = gl.createBuffer()!;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer);
    // Reallocate to exactly what is drawn: the color-transform data array grows lazily as tints are
    // recorded, so a fixed subData offset could outrun a stale buffer. Only per-instance-tinted
    // batches pay this, and the untinted common path never allocates the buffer at all.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      runtime.spriteBatchColorTransformData!.subarray(0, count * COLOR_TRANSFORM_FLOATS),
      gl.DYNAMIC_DRAW,
    );
    bindGlSpriteBatchInstancedColorTransform(state);
    return true;
  }

  if (isColorMatrixData(uniformColorTransform!)) {
    promoteGlSpriteBatchColorTransformToMatrix(runtime, count, uniformColorTransform!);
    runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
    const gl = state.gl;
    if (runtime.spriteBatchColorTransformBuffer == null) runtime.spriteBatchColorTransformBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      runtime.spriteBatchColorMatrixData!.subarray(0, count * COLOR_MATRIX_FLOATS),
      gl.DYNAMIC_DRAW,
    );
    bindGlSpriteBatchInstancedColorMatrix(state);
  } else {
    bindGlSpriteBatchUniformColorTransform(state, uniformColorTransform!);
  }
  return true;
}

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instanceCount) with `fill` (a prior uniform value, or null → identity), so promotion never
// changes the appearance of instances written before the divergence.
function promoteGlSpriteBatchColorTransformToPerInstance(
  runtime: GlRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorTransform | TintMaterialData> | null,
): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PER_INSTANCE;
  for (let i = 0; i < instanceCount; i++) writeGlColorTransformInstance(runtime, fill, i);
}

function promoteGlSpriteBatchColorTransformToPackedTint(
  runtime: GlRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorTransform | TintMaterialData> | null,
): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PACKED_TINT;
  for (let i = 0; i < instanceCount; i++) writeGlPackedTintInstance(runtime, getPackedTint(fill)!, i);
}

function promoteGlPackedTintToColorTransform(runtime: GlRenderStateRuntime, instanceCount: number): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PER_INSTANCE;
  const packed = runtime.spriteBatchColorTintData!;
  for (let i = 0; i < instanceCount; i++) writeGlNativePackedTintAsColorTransform(runtime, packed[i], i);
}

function promoteGlSpriteBatchColorTransformToMatrix(
  runtime: GlRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorAdjustmentData> | null,
): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeGlColorMatrixInstance(runtime, fill, i);
}

function promoteGlPackedTintToColorMatrix(runtime: GlRenderStateRuntime, instanceCount: number): void {
  const packed = runtime.spriteBatchColorTintData!;
  runtime.spriteBatchColorTransformMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeGlNativePackedTintAsColorMatrix(runtime, packed[i], i);
}

function promoteGlColorTransformToMatrix(runtime: GlRenderStateRuntime, instanceCount: number): void {
  const affine = runtime.spriteBatchColorTransformData!;
  runtime.spriteBatchColorTransformMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) {
    const base = i * COLOR_TRANSFORM_FLOATS;
    writeGlAffineValuesAsColorMatrix(runtime, affine, base, i);
  }
}

// Folds instance `instanceIndex`'s effective color transform into the active batch. See the fold-mode
// constants for the promotion rules. `colorTransform` is null for an untinted instance.
function recordGlColorAdjustment(
  runtime: GlRenderStateRuntime,
  colorTransform: ColorAdjustmentData | null | undefined,
  instanceIndex: number,
): void {
  const mode = runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE;
  const tint = colorTransform ?? null;

  if (mode === CT_MODE_MATRIX) {
    writeGlColorMatrixInstance(runtime, tint, instanceIndex);
    return;
  }

  if (mode === CT_MODE_NONE) {
    if (tint === null) return;
    if (instanceIndex === 0) {
      runtime.spriteBatchColorTransformMode = CT_MODE_UNIFORM;
      runtime.spriteBatchUniformColorTransform = tint;
      return;
    }
    if (isColorMatrixData(tint)) {
      promoteGlSpriteBatchColorTransformToMatrix(runtime, instanceIndex, null);
      writeGlColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    if (getPackedTint(tint) !== null) {
      promoteGlSpriteBatchColorTransformToPackedTint(runtime, instanceIndex, null);
      writeGlPackedTintInstance(runtime, getPackedTint(tint)!, instanceIndex);
    } else {
      promoteGlSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, null);
      writeGlColorTransformInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_UNIFORM) {
    const uniform = runtime.spriteBatchUniformColorTransform ?? null;
    if (equalsRecordedColorTransform(tint, uniform)) return;
    if (isColorMatrixData(tint) || (uniform !== null && isColorMatrixData(uniform))) {
      promoteGlSpriteBatchColorTransformToMatrix(runtime, instanceIndex, uniform);
      writeGlColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (getPackedTint(uniform) !== null && packedTint !== null) {
      promoteGlSpriteBatchColorTransformToPackedTint(runtime, instanceIndex, uniform);
      writeGlPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteGlSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, uniform);
      writeGlColorTransformInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_PACKED_TINT) {
    if (isColorMatrixData(tint)) {
      promoteGlPackedTintToColorMatrix(runtime, instanceIndex);
      writeGlColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (packedTint !== null) {
      writeGlPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteGlPackedTintToColorTransform(runtime, instanceIndex);
      writeGlColorTransformInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (isColorMatrixData(tint)) {
    promoteGlColorTransformToMatrix(runtime, instanceIndex);
    writeGlColorMatrixInstance(runtime, tint, instanceIndex);
    return;
  }
  writeGlColorTransformInstance(runtime, tint, instanceIndex);
}

function writeGlColorMatrixInstance(
  runtime: GlRenderStateRuntime,
  adjustment: Readonly<ColorAdjustmentData> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  let data = runtime.spriteBatchColorMatrixData;
  if (data === undefined) {
    data = new Float32Array(COLOR_MATRIX_FLOATS * 256);
    runtime.spriteBatchColorMatrixData = data;
  } else if (offset + COLOR_MATRIX_FLOATS > data.length) {
    const grown = new Float32Array(Math.max(offset + COLOR_MATRIX_FLOATS, data.length * 2));
    grown.set(data);
    runtime.spriteBatchColorMatrixData = grown;
    data = grown;
  }
  if (adjustment === null) {
    writeIdentityColorMatrix(data, offset);
  } else if (isColorMatrixData(adjustment)) {
    for (let row = 0; row < 4; row++) {
      const source = row * 5;
      const target = offset + row * 4;
      data[target] = adjustment[source]!;
      data[target + 1] = adjustment[source + 1]!;
      data[target + 2] = adjustment[source + 2]!;
      data[target + 3] = adjustment[source + 3]!;
      data[offset + 16 + row] = adjustment[source + 4]! / 255;
    }
  } else {
    writeIdentityColorMatrix(data, offset);
    for (let channel = 0; channel < 4; channel++) {
      data[offset + channel * 4 + channel] = getColorMultiplier(adjustment, channel);
      data[offset + 16 + channel] = getColorOffset(adjustment, channel);
    }
  }
}

function writeIdentityColorMatrix(out: Float32Array, offset: number): void {
  out.fill(0, offset, offset + COLOR_MATRIX_FLOATS);
  out[offset] = out[offset + 5] = out[offset + 10] = out[offset + 15] = 1;
}

function writeGlNativePackedTintAsColorMatrix(
  runtime: GlRenderStateRuntime,
  nativeWord: number,
  instanceIndex: number,
): void {
  writeGlColorMatrixInstance(runtime, null, instanceIndex);
  const out = runtime.spriteBatchColorMatrixData!;
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  out[offset] = (nativeWord & 0xff) / 255;
  out[offset + 5] = ((nativeWord >>> 8) & 0xff) / 255;
  out[offset + 10] = ((nativeWord >>> 16) & 0xff) / 255;
  out[offset + 15] = ((nativeWord >>> 24) & 0xff) / 255;
}

function writeGlAffineValuesAsColorMatrix(
  runtime: GlRenderStateRuntime,
  affine: Float32Array,
  affineOffset: number,
  instanceIndex: number,
): void {
  writeGlColorMatrixInstance(runtime, null, instanceIndex);
  const out = runtime.spriteBatchColorMatrixData!;
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  for (let channel = 0; channel < 4; channel++) {
    out[offset + channel * 4 + channel] = affine[affineOffset + channel]!;
    out[offset + 16 + channel] = affine[affineOffset + 4 + channel]!;
  }
}

// Writes one instance's eight color-transform floats (multiplier rgba, then offset rgba normalized by
// 255) at its slot in the batch's color-transform data, growing the array as needed. A null transform
// writes the identity (multiply by 1, add 0).
function writeGlColorTransformInstance(
  runtime: GlRenderStateRuntime,
  colorTransform: Readonly<ColorTransform | TintMaterialData> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_TRANSFORM_FLOATS;
  let data = runtime.spriteBatchColorTransformData;
  if (data === undefined) {
    data = new Float32Array(COLOR_TRANSFORM_FLOATS * 256);
    runtime.spriteBatchColorTransformData = data;
  }
  if (offset + COLOR_TRANSFORM_FLOATS > data.length) {
    const newSize = Math.max(offset + COLOR_TRANSFORM_FLOATS, data.length * 2);
    const grown = new Float32Array(newSize);
    grown.set(data);
    runtime.spriteBatchColorTransformData = grown;
    data = grown;
  }
  if (colorTransform !== null) {
    for (let channel = 0; channel < 4; channel++) {
      data[offset + channel] = getColorMultiplier(colorTransform, channel);
      data[offset + 4 + channel] = getColorOffset(colorTransform, channel);
    }
  } else {
    data[offset] = 1;
    data[offset + 1] = 1;
    data[offset + 2] = 1;
    data[offset + 3] = 1;
    data[offset + 4] = 0;
    data[offset + 5] = 0;
    data[offset + 6] = 0;
    data[offset + 7] = 0;
  }
}

function writeGlPackedTintInstance(runtime: GlRenderStateRuntime, rgba: number, instanceIndex: number): void {
  let data = runtime.spriteBatchColorTintData;
  if (data === undefined) {
    data = new Uint32Array(256);
    runtime.spriteBatchColorTintData = data;
  } else if (instanceIndex >= data.length) {
    const grown = new Uint32Array(Math.max(instanceIndex + 1, data.length * 2));
    grown.set(data);
    runtime.spriteBatchColorTintData = grown;
    data = grown;
  }
  data[instanceIndex] = rgbaToNativeByteWord(rgba);
}

function writeGlNativePackedTintAsColorTransform(
  runtime: GlRenderStateRuntime,
  nativeWord: number,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_TRANSFORM_FLOATS;
  writeGlColorTransformInstance(runtime, null, instanceIndex);
  const data = runtime.spriteBatchColorTransformData!;
  data[offset] = (nativeWord & 0xff) / 255;
  data[offset + 1] = ((nativeWord >>> 8) & 0xff) / 255;
  data[offset + 2] = ((nativeWord >>> 16) & 0xff) / 255;
  data[offset + 3] = ((nativeWord >>> 24) & 0xff) / 255;
}

function getPackedTint(value: Readonly<ColorTransform | TintMaterialData> | null): number | null {
  if (value === null) return 0xffffffff;
  if (isTintMaterialData(value)) return value.tint >>> 0;
  if (
    value.redOffset !== 0 ||
    value.greenOffset !== 0 ||
    value.blueOffset !== 0 ||
    value.alphaOffset !== 0 ||
    value.redMultiplier < 0 ||
    value.redMultiplier > 1 ||
    value.greenMultiplier < 0 ||
    value.greenMultiplier > 1 ||
    value.blueMultiplier < 0 ||
    value.blueMultiplier > 1 ||
    value.alphaMultiplier < 0 ||
    value.alphaMultiplier > 1
  ) {
    return null;
  }
  return (
    ((Math.round(value.redMultiplier * 255) << 24) |
      (Math.round(value.greenMultiplier * 255) << 16) |
      (Math.round(value.blueMultiplier * 255) << 8) |
      Math.round(value.alphaMultiplier * 255)) >>>
    0
  );
}

function isColorMatrixData(value: Readonly<ColorAdjustmentData> | null): value is readonly number[] {
  return Array.isArray(value);
}

function rgbaToNativeByteWord(rgba: number): number {
  return (
    (((rgba >>> 24) & 0xff) | (((rgba >>> 16) & 0xff) << 8) | (((rgba >>> 8) & 0xff) << 16) | ((rgba & 0xff) << 24)) >>>
    0
  );
}

function isTintMaterialData(value: Readonly<ColorTransform | TintMaterialData>): value is Readonly<TintMaterialData> {
  return 'tint' in value;
}

function getColorMultiplier(value: Readonly<ColorTransform | TintMaterialData>, channel: number): number {
  if (isTintMaterialData(value)) return ((value.tint >>> (24 - channel * 8)) & 0xff) / 255;
  if (channel === 0) return value.redMultiplier;
  if (channel === 1) return value.greenMultiplier;
  if (channel === 2) return value.blueMultiplier;
  return value.alphaMultiplier;
}

function getColorOffset(value: Readonly<ColorTransform | TintMaterialData>, channel: number): number {
  if (isTintMaterialData(value)) return 0;
  if (channel === 0) return value.redOffset / 255;
  if (channel === 1) return value.greenOffset / 255;
  if (channel === 2) return value.blueOffset / 255;
  return value.alphaOffset / 255;
}

// Draws the GPU-tessellated solid-fill meshes tinted by the node's color transform. A single mesh is
// one flat color and a shape shares one whole-node transform, so this is the uniform path (CT_MODE_
// UNIFORM's mesh analogue): u_ctMult/u_ctOff uploaded once, no per-vertex tint data. Reuses the base
// mesh draw driver and its shared vertex/index buffers — only the fragment program differs, so the
// projection and per-mesh premultiplied color stay identical to the untinted path. Falls back to the
// lean program when the node happens to carry no transform (the caller gates on non-null, but the fold
// stays correct if reached directly).
function drawGlShapeMeshesColorTransform(
  state: GlRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly GlShapeMesh[],
): void {
  const colorMatrix = renderProxy.colorMatrix;
  const colorTransform = renderProxy.colorTransform;
  const base = ensureGlShapeMeshProgram(state);
  if (colorMatrix == null && colorTransform === null) {
    drawGlShapeMeshBatch(state, renderProxy, meshes, base);
    return;
  }
  const shader =
    colorMatrix == null ? ensureGlShapeMeshColorTransformShader(state) : ensureGlShapeMeshColorMatrixShader(state);
  const binding: GlShapeMeshBinding = {
    program: shader.program,
    vertexBuffer: base.vertexBuffer,
    indexBuffer: base.indexBuffer,
    positionLocation: shader.positionLocation,
    matrixLocation: shader.matrixLocation,
    colorLocation: shader.colorLocation,
  };
  drawGlShapeMeshBatch(state, renderProxy, meshes, binding, (bound) => {
    const gl = bound.gl;
    if (colorMatrix != null) {
      const locations = shader.colorMatrixLocations!;
      for (let row = 0; row < 4; row++) {
        const source = row * 5;
        gl.uniform4f(
          locations[row]!,
          colorMatrix[source]!,
          colorMatrix[source + 1]!,
          colorMatrix[source + 2]!,
          colorMatrix[source + 3]!,
        );
      }
      gl.uniform4f(
        locations[4]!,
        colorMatrix[4]! / 255,
        colorMatrix[9]! / 255,
        colorMatrix[14]! / 255,
        colorMatrix[19]! / 255,
      );
      return;
    }
    gl.uniform4f(
      shader.colorMultiplierLocation,
      colorTransform!.redMultiplier,
      colorTransform!.greenMultiplier,
      colorTransform!.blueMultiplier,
      colorTransform!.alphaMultiplier,
    );
    gl.uniform4f(
      shader.colorOffsetLocation,
      colorTransform!.redOffset / 255,
      colorTransform!.greenOffset / 255,
      colorTransform!.blueOffset / 255,
      colorTransform!.alphaOffset / 255,
    );
  });
}

function ensureGlShapeMeshColorMatrixShader(state: GlRenderState): GlShapeMeshColorTransformShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.shapeMeshColorMatrixShader) return runtime.shapeMeshColorMatrixShader;
  const gl = state.gl;
  const program = createGlProgram(gl, SHAPE_MESH_CT_VS, SHAPE_MESH_MATRIX_FS, 'Shape-mesh color matrix');
  runtime.shapeMeshColorMatrixShader = {
    program,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    matrixLocation: gl.getUniformLocation(program, 'u_matrix'),
    colorLocation: gl.getUniformLocation(program, 'u_color'),
    colorMultiplierLocation: null,
    colorOffsetLocation: null,
    colorMatrixLocations: [
      gl.getUniformLocation(program, 'u_ctRow0'),
      gl.getUniformLocation(program, 'u_ctRow1'),
      gl.getUniformLocation(program, 'u_ctRow2'),
      gl.getUniformLocation(program, 'u_ctRow3'),
      gl.getUniformLocation(program, 'u_ctOff'),
    ],
  };
  return runtime.shapeMeshColorMatrixShader;
}

function ensureGlShapeMeshColorTransformShader(state: GlRenderState): GlShapeMeshColorTransformShader {
  const runtime = getGlRenderStateRuntime(state);
  if (runtime.shapeMeshColorTransformShader) return runtime.shapeMeshColorTransformShader;

  const gl = state.gl;
  const program = createGlProgram(gl, SHAPE_MESH_CT_VS, SHAPE_MESH_CT_FS, 'Shape-mesh color transform');
  runtime.shapeMeshColorTransformShader = {
    program,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    matrixLocation: gl.getUniformLocation(program, 'u_matrix'),
    colorLocation: gl.getUniformLocation(program, 'u_color'),
    colorMultiplierLocation: gl.getUniformLocation(program, 'u_ctMult'),
    colorOffsetLocation: gl.getUniformLocation(program, 'u_ctOff'),
  };
  return runtime.shapeMeshColorTransformShader;
}

// Mirrors the base flat-color mesh vertex shader (glShapeMesh's VERTEX_SOURCE): u_matrix is the shared
// projection · world transform drawGlShapeMeshBatch uploads, so a tinted mesh lands pixel-aligned with
// an untinted one.
const SHAPE_MESH_CT_VS = `
attribute vec2 a_position;
uniform mat3 u_matrix;
void main() {
  vec3 p = u_matrix * vec3(a_position, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}
`;

// The tint fragment scene2d. u_color arrives premultiplied (the driver uploads color·alpha), so the math
// un-premultiplies, applies the color transform (multiplier then /255-normalized offset), clamps, and
// re-premultiplies — byte-for-byte with the quad-batch uniform/instanced color-transform shaders.
const SHAPE_MESH_CT_FS = `
precision mediump float;
uniform vec4 u_color;
uniform vec4 u_ctMult;
uniform vec4 u_ctOff;
${GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
void main() {
  vec4 color = u_color;
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, u_ctMult, u_ctOff);
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}
`;

const SHAPE_MESH_MATRIX_FS = `
precision mediump float;
uniform vec4 u_color;
uniform vec4 u_ctRow0;
uniform vec4 u_ctRow1;
uniform vec4 u_ctRow2;
uniform vec4 u_ctRow3;
uniform vec4 u_ctOff;
${GL_COLOR_MATRIX_FRAGMENT_CHUNK}
void main() {
  vec4 color = u_color;
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorMatrix(color, u_ctRow0, u_ctRow1, u_ctRow2, u_ctRow3, u_ctOff);
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}
`;

const glColorAdjustmentMaterialFeature: GlColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
  matrixFragmentShaderChunk: GL_COLOR_MATRIX_FRAGMENT_CHUNK,
  drawShapeMeshes: drawGlShapeMeshesColorTransform,
  flush: flushGlColorAdjustmentMaterialFeature,
  record: recordGlColorAdjustment,
};
