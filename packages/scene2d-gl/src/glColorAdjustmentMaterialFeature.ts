import { createSlotTable } from '@flighthq/registry/contract';
import { createGlProgram } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { enableColorAdjustments } from '@flighthq/render/contract';
import type {
  ColorScaleBias,
  GlColorAdjustmentMaterialFeature,
  GlColorAdjustmentResources,
  GlColorScaleBiasInstancedShader,
  GlRenderState,
  GlRenderStateRuntime,
  GlShapeMesh,
  GlShapeMeshColorScaleBiasShader,
  GlUniformColorScaleBiasShader,
  RenderProxy2D,
  TintMaterialData,
} from '@flighthq/types/contract';
import type { GlShapeMeshBinding } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import {
  bindGlQuadBatchBaseAttributes,
  QUAD_BATCH_VS,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glQuadBatchWriter';
import { drawGlShapeMeshBatch, ensureGlShapeMeshProgram } from './glShapeMesh';

// Enables the opt-in color-adjustment accumulator and inline fold on a WebGL render state: the fused-color-matrix
// scene2d the sprite/quad batch draws through so a color adjustment (and, later, other pointwise
// adjustments) folds into the batch as data — a whole-batch uniform tint or per-instance
// a_colorScale/a_colorBias attributes, chosen by data cardinality — without ever splitting the batch. Until a
// state calls this, its render proxies stay unadjusted and the batch renderer carries none of this module's shader
// code (both tree-shake out)
// and recordGlQuadBatchColorScaleBias silently skips every tint. Idempotent; safe to call per state.
export function registerGlColorAdjustmentMaterialFeature(state: GlRenderState): void {
  enableColorAdjustments(state);
  const runtime = getGlRenderStateRuntime(state);
  const table = runtime.registries.colorAdjustmentFeature ?? createSlotTable('GlColorAdjustmentFeature', 'Disabled');
  if (table.entry?.state !== RegistryEntryState.Bound || table.entry.value !== glColorAdjustmentMaterialFeature) {
    runtime.registries.colorAdjustmentFeature = {
      ...table,
      entry: { state: RegistryEntryState.Bound, value: glColorAdjustmentMaterialFeature },
    };
  }
  if (runtime.quadBatchWriterColorScaleBiasMode === undefined) runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_NONE;
}

// Per-instance color-adjustment layout (8 floats = 32 bytes): 4 scale + 4 bias, at attribute
// locations 7 (a_colorScale) and 8 (a_colorBias). Used only when a batch carries varying tints (mode 2).
const COLOR_SCALE_BIAS_FLOATS = 8;
const COLOR_SCALE_BIAS_STRIDE = COLOR_SCALE_BIAS_FLOATS * 4;
const COLOR_MATRIX_FLOATS = 20;
const COLOR_MATRIX_STRIDE = COLOR_MATRIX_FLOATS * 4;

// Color-adjustment fold modes for the active quad-batch writer. NONE keeps the lean base shader; UNIFORM
// binds one whole-batch tint; PER_INSTANCE packs a tint per instance. A batch starts at NONE, rises to
// UNIFORM on the first tint, and promotes to PER_INSTANCE — back-filling already-written instances
// with the prior value/identity — when tints diverge, so a tint only ever promotes a batch, never
// splits it.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PACKED_TINT = 2;
const CT_MODE_PER_INSTANCE = 3;
const CT_MODE_MATRIX = 4;

type ColorAdjustmentData = ColorScaleBias | TintMaterialData | readonly number[];

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

// Per-instance color-adjustment program: the base quad-batch vertex work plus two vec4 instance
// attributes (a_colorScale / a_colorBias) carried through to the fragment scene2d. The color-adjustment math is
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
layout(location = 7) in vec4 a_colorScale;
layout(location = 8) in vec4 a_colorBias;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;
out vec4 v_colorScale;
out vec4 v_colorBias;

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
  v_colorScale = a_colorScale;
  v_colorBias = a_colorBias;
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
layout(location = 7) in vec4 a_colorScale;

uniform mat3 u_world;

out vec2 v_texCoord;
out float v_alpha;
out vec4 v_colorScale;

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
  v_colorScale = a_colorScale;
}`;

const CT_PACKED_TINT_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_colorScale;
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
  color = applyFlightColorAdjustment(color, v_colorScale, vec4(0.0));
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

const CT_INSTANCED_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_colorScale;
in vec4 v_colorBias;
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
  color = applyFlightColorAdjustment(color, v_colorScale, v_colorBias);
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
layout(location = 11) in vec4 a_colorBias;
uniform mat3 u_world;
out vec2 v_texCoord;
out float v_alpha;
out vec4 v_ctRow0;
out vec4 v_ctRow1;
out vec4 v_ctRow2;
out vec4 v_ctRow3;
out vec4 v_colorBias;
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
  v_colorBias = a_colorBias;
}`;

const CT_MATRIX_INSTANCED_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
in vec4 v_ctRow0;
in vec4 v_ctRow1;
in vec4 v_ctRow2;
in vec4 v_ctRow3;
in vec4 v_colorBias;
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
  color = applyFlightColorMatrix(color, v_ctRow0, v_ctRow1, v_ctRow2, v_ctRow3, v_colorBias);
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

// Whole-batch color-adjustment fragment shader (over the base vertex shader): one tint uploaded as
// u_colorScale/u_colorBias uniforms and shared by every instance. This is the uniform path — a single tint on
// a whole batch (e.g. a bitmap-text node) costs no per-instance data.
const UNIFORM_CT_FS = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in float v_alpha;
uniform sampler2D u_texture;
uniform bool u_straightTextureAlpha;
uniform vec4 u_colorScale;
uniform vec4 u_colorBias;
out vec4 fragColor;
${GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  if (u_straightTextureAlpha) color.rgb *= color.a;
  color *= clamp(v_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, u_colorScale, u_colorBias);
  fragColor = vec4(color.rgb * color.a, color.a);
}`;

// Binds the whole-batch (uniform) color-adjustment program and uploads the shared tint. Base
// attributes come from the standard instance buffer; there is no per-instance tint data.
function bindGlQuadBatchWriterUniformColorScaleBias(
  state: GlRenderState,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData>,
): void {
  const shader = ensureGlUniformColorScaleBiasShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);

  const gl = state.gl;
  gl.uniform4f(
    shader.locColorScale,
    getColorScale(colorScaleBias, 0),
    getColorScale(colorScaleBias, 1),
    getColorScale(colorScaleBias, 2),
    getColorScale(colorScaleBias, 3),
  );
  gl.uniform4f(
    shader.locColorBias,
    getColorBias(colorScaleBias, 0),
    getColorBias(colorScaleBias, 1),
    getColorBias(colorScaleBias, 2),
    getColorBias(colorScaleBias, 3),
  );
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);
}

function bindGlQuadBatchWriterInstancedColorMatrix(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const shader = ensureGlColorMatrixInstancedShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);
  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadBatchResources!.writerColorScaleBiasBuffer!);
  for (let attribute = 0; attribute < 5; attribute++) {
    const location = 7 + attribute;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, COLOR_MATRIX_STRIDE, attribute * 16);
    gl.vertexAttribDivisor(location, 1);
  }
}

// Binds the per-instance color-adjustment program and the a_colorScale/a_colorBias attribute stream from the
// batch's color-adjustment buffer, alongside the base instance attributes.
function bindGlQuadBatchWriterInstancedColorScaleBias(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const shader = ensureGlColorScaleBiasInstancedShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);

  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadBatchResources!.writerColorScaleBiasBuffer!);
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 4, gl.FLOAT, false, COLOR_SCALE_BIAS_STRIDE, 0);
  gl.vertexAttribDivisor(7, 1);
  gl.enableVertexAttribArray(8);
  gl.vertexAttribPointer(8, 4, gl.FLOAT, false, COLOR_SCALE_BIAS_STRIDE, 16);
  gl.vertexAttribDivisor(8, 1);
}

function bindGlQuadBatchWriterPackedTint(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const shader = ensureGlColorTintInstancedShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture, shader.locStraightTextureAlpha);
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);

  const gl = state.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, runtime.context.quadBatchResources!.writerColorScaleBiasBuffer!);
  gl.enableVertexAttribArray(7);
  gl.vertexAttribPointer(7, 4, gl.UNSIGNED_BYTE, true, 4, 0);
  gl.vertexAttribDivisor(7, 1);
}

function ensureGlColorAdjustmentResources(
  state: GlRenderState,
  runtime: GlRenderStateRuntime,
): GlColorAdjustmentResources {
  const gl = state.gl;

  const scaleBiasProgram = createGlProgram(
    gl,
    CT_INSTANCED_VS,
    CT_INSTANCED_FS,
    'Sprite-batch color adjustment (per-instance)',
  );
  const matrixProgram = createGlProgram(
    gl,
    CT_MATRIX_INSTANCED_VS,
    CT_MATRIX_INSTANCED_FS,
    'Sprite-batch color matrix',
  );
  const tintProgram = createGlProgram(gl, CT_PACKED_TINT_VS, CT_PACKED_TINT_FS, 'Sprite-batch tint (RGBA8)');
  const uniformProgram = createGlProgram(gl, QUAD_BATCH_VS, UNIFORM_CT_FS, 'Sprite-batch color adjustment (uniform)');

  const resources: GlColorAdjustmentResources = {
    scaleBiasInstancedShader: {
      program: scaleBiasProgram,
      locCorner: 0,
      locWorldMatrix: gl.getUniformLocation(scaleBiasProgram, 'u_world')!,
      locTexture: gl.getUniformLocation(scaleBiasProgram, 'u_texture')!,
      locStraightTextureAlpha: gl.getUniformLocation(scaleBiasProgram, 'u_straightTextureAlpha')!,
    },
    matrixInstancedShader: {
      program: matrixProgram,
      locCorner: 0,
      locWorldMatrix: gl.getUniformLocation(matrixProgram, 'u_world')!,
      locTexture: gl.getUniformLocation(matrixProgram, 'u_texture')!,
      locStraightTextureAlpha: gl.getUniformLocation(matrixProgram, 'u_straightTextureAlpha')!,
    },
    tintInstancedShader: {
      program: tintProgram,
      locCorner: 0,
      locWorldMatrix: gl.getUniformLocation(tintProgram, 'u_world')!,
      locTexture: gl.getUniformLocation(tintProgram, 'u_texture')!,
      locStraightTextureAlpha: gl.getUniformLocation(tintProgram, 'u_straightTextureAlpha')!,
    },
    uniformScaleBiasShader: {
      program: uniformProgram,
      locCorner: 0,
      locWorldMatrix: gl.getUniformLocation(uniformProgram, 'u_world')!,
      locTexture: gl.getUniformLocation(uniformProgram, 'u_texture')!,
      locStraightTextureAlpha: gl.getUniformLocation(uniformProgram, 'u_straightTextureAlpha')!,
      locColorScale: gl.getUniformLocation(uniformProgram, 'u_colorScale')!,
      locColorBias: gl.getUniformLocation(uniformProgram, 'u_colorBias')!,
    },
  };
  runtime.context.colorAdjustmentResources = resources;
  return resources;
}

function ensureGlColorScaleBiasInstancedShader(state: GlRenderState): GlColorScaleBiasInstancedShader {
  const runtime = getGlRenderStateRuntime(state);
  const resources = runtime.context.colorAdjustmentResources;
  if (resources) return resources.scaleBiasInstancedShader;
  return ensureGlColorAdjustmentResources(state, runtime).scaleBiasInstancedShader;
}

function ensureGlColorMatrixInstancedShader(state: GlRenderState): GlColorScaleBiasInstancedShader {
  const runtime = getGlRenderStateRuntime(state);
  const resources = runtime.context.colorAdjustmentResources;
  if (resources) return resources.matrixInstancedShader;
  return ensureGlColorAdjustmentResources(state, runtime).matrixInstancedShader;
}

function ensureGlColorTintInstancedShader(state: GlRenderState): GlColorScaleBiasInstancedShader {
  const runtime = getGlRenderStateRuntime(state);
  const resources = runtime.context.colorAdjustmentResources;
  if (resources) return resources.tintInstancedShader;
  return ensureGlColorAdjustmentResources(state, runtime).tintInstancedShader;
}

function ensureGlUniformColorScaleBiasShader(state: GlRenderState): GlUniformColorScaleBiasShader {
  const runtime = getGlRenderStateRuntime(state);
  const resources = runtime.context.colorAdjustmentResources;
  if (resources) return resources.uniformScaleBiasShader;
  return ensureGlColorAdjustmentResources(state, runtime).uniformScaleBiasShader;
}

// Value equality for the whole-batch uniform check: reference-equal short-circuits (the common case —
// every glyph of a bitmap-text node shares one node-level tint), else compares all eight fields so a
// distinct-but-equal tint still keeps the batch on the cheaper uniform path.
function equalsRecordedColorScaleBias(
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
      getColorScale(a, channel) !== getColorScale(b, channel) ||
      getColorBias(a, channel) !== getColorBias(b, channel)
    ) {
      return false;
    }
  }
  return true;
}

// Uploads the active batch's per-instance color-adjustment buffer, selects the fold program (uniform or
// per-instance), and binds it. Returns true when it drew a folded batch; false when the batch carried
// no tint, so flushGlQuadBatchWriter runs the lean material path instead. Resets the fold mode for the
// next batch.
function flushGlColorAdjustmentMaterialFeature(state: GlRenderState, count: number): boolean {
  const runtime = getGlRenderStateRuntime(state);
  const ctMode = runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE;
  if (ctMode === CT_MODE_NONE) return false;
  const uniformColorScaleBias = runtime.quadBatchWriterUniformColorScaleBias ?? null;
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_NONE;
  runtime.quadBatchWriterUniformColorScaleBias = null;

  if (ctMode === CT_MODE_PACKED_TINT) {
    const gl = state.gl;
    const qbr = runtime.context.quadBatchResources!;
    if (qbr.writerColorScaleBiasBuffer == null) {
      qbr.writerColorScaleBiasBuffer = gl.createBuffer()!;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerColorScaleBiasBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, runtime.quadBatchWriterColorTintData!.subarray(0, count), gl.DYNAMIC_DRAW);
    bindGlQuadBatchWriterPackedTint(state);
    return true;
  }

  if (ctMode === CT_MODE_MATRIX) {
    const gl = state.gl;
    const qbr = runtime.context.quadBatchResources!;
    if (qbr.writerColorScaleBiasBuffer == null) qbr.writerColorScaleBiasBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerColorScaleBiasBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      runtime.quadBatchWriterColorMatrixData!.subarray(0, count * COLOR_MATRIX_FLOATS),
      gl.DYNAMIC_DRAW,
    );
    bindGlQuadBatchWriterInstancedColorMatrix(state);
    return true;
  }

  if (ctMode === CT_MODE_PER_INSTANCE) {
    const gl = state.gl;
    const qbr = runtime.context.quadBatchResources!;
    if (qbr.writerColorScaleBiasBuffer == null) {
      qbr.writerColorScaleBiasBuffer = gl.createBuffer()!;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerColorScaleBiasBuffer);
    // Reallocate to exactly what is drawn: the color-adjustment data array grows lazily as tints are
    // recorded, so a fixed subData offset could outrun a stale buffer. Only per-instance-tinted
    // batches pay this, and the untinted common path never allocates the buffer at all.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      runtime.quadBatchWriterColorScaleBiasData!.subarray(0, count * COLOR_SCALE_BIAS_FLOATS),
      gl.DYNAMIC_DRAW,
    );
    bindGlQuadBatchWriterInstancedColorScaleBias(state);
    return true;
  }

  if (isColorMatrixData(uniformColorScaleBias!)) {
    promoteGlQuadBatchWriterColorScaleBiasToMatrix(runtime, count, uniformColorScaleBias!);
    runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_NONE;
    const gl = state.gl;
    const qbr = runtime.context.quadBatchResources!;
    if (qbr.writerColorScaleBiasBuffer == null) qbr.writerColorScaleBiasBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qbr.writerColorScaleBiasBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      runtime.quadBatchWriterColorMatrixData!.subarray(0, count * COLOR_MATRIX_FLOATS),
      gl.DYNAMIC_DRAW,
    );
    bindGlQuadBatchWriterInstancedColorMatrix(state);
  } else {
    bindGlQuadBatchWriterUniformColorScaleBias(state, uniformColorScaleBias!);
  }
  return true;
}

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instanceCount) with `fill` (a prior uniform value, or null → identity), so promotion never
// changes the appearance of instances written before the divergence.
function promoteGlQuadBatchWriterColorScaleBiasToPerInstance(
  runtime: GlRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorScaleBias | TintMaterialData> | null,
): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PER_INSTANCE;
  for (let i = 0; i < instanceCount; i++) writeGlColorScaleBiasInstance(runtime, fill, i);
}

function promoteGlQuadBatchWriterColorScaleBiasToPackedTint(
  runtime: GlRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorScaleBias | TintMaterialData> | null,
): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PACKED_TINT;
  for (let i = 0; i < instanceCount; i++) writeGlPackedTintInstance(runtime, getPackedTint(fill)!, i);
}

function promoteGlPackedTintToColorScaleBias(runtime: GlRenderStateRuntime, instanceCount: number): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PER_INSTANCE;
  const packed = runtime.quadBatchWriterColorTintData!;
  for (let i = 0; i < instanceCount; i++) writeGlNativePackedTintAsColorScaleBias(runtime, packed[i], i);
}

function promoteGlQuadBatchWriterColorScaleBiasToMatrix(
  runtime: GlRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorAdjustmentData> | null,
): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeGlColorMatrixInstance(runtime, fill, i);
}

function promoteGlPackedTintToColorMatrix(runtime: GlRenderStateRuntime, instanceCount: number): void {
  const packed = runtime.quadBatchWriterColorTintData!;
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeGlNativePackedTintAsColorMatrix(runtime, packed[i], i);
}

function promoteGlColorScaleBiasToMatrix(runtime: GlRenderStateRuntime, instanceCount: number): void {
  const affine = runtime.quadBatchWriterColorScaleBiasData!;
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) {
    const base = i * COLOR_SCALE_BIAS_FLOATS;
    writeGlAffineValuesAsColorMatrix(runtime, affine, base, i);
  }
}

// Folds instance `instanceIndex`'s effective color adjustment into the active batch. See the fold-mode
// constants for the promotion rules. `colorScaleBias` is null for an untinted instance.
function recordGlColorAdjustment(
  runtime: GlRenderStateRuntime,
  colorScaleBias: ColorAdjustmentData | null | undefined,
  instanceIndex: number,
): void {
  const mode = runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE;
  const tint = colorScaleBias ?? null;

  if (mode === CT_MODE_MATRIX) {
    writeGlColorMatrixInstance(runtime, tint, instanceIndex);
    return;
  }

  if (mode === CT_MODE_NONE) {
    if (tint === null) return;
    if (instanceIndex === 0) {
      runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_UNIFORM;
      runtime.quadBatchWriterUniformColorScaleBias = tint;
      return;
    }
    if (isColorMatrixData(tint)) {
      promoteGlQuadBatchWriterColorScaleBiasToMatrix(runtime, instanceIndex, null);
      writeGlColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    if (getPackedTint(tint) !== null) {
      promoteGlQuadBatchWriterColorScaleBiasToPackedTint(runtime, instanceIndex, null);
      writeGlPackedTintInstance(runtime, getPackedTint(tint)!, instanceIndex);
    } else {
      promoteGlQuadBatchWriterColorScaleBiasToPerInstance(runtime, instanceIndex, null);
      writeGlColorScaleBiasInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_UNIFORM) {
    const uniform = runtime.quadBatchWriterUniformColorScaleBias ?? null;
    if (equalsRecordedColorScaleBias(tint, uniform)) return;
    if (isColorMatrixData(tint) || (uniform !== null && isColorMatrixData(uniform))) {
      promoteGlQuadBatchWriterColorScaleBiasToMatrix(runtime, instanceIndex, uniform);
      writeGlColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (getPackedTint(uniform) !== null && packedTint !== null) {
      promoteGlQuadBatchWriterColorScaleBiasToPackedTint(runtime, instanceIndex, uniform);
      writeGlPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteGlQuadBatchWriterColorScaleBiasToPerInstance(runtime, instanceIndex, uniform);
      writeGlColorScaleBiasInstance(runtime, tint, instanceIndex);
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
      promoteGlPackedTintToColorScaleBias(runtime, instanceIndex);
      writeGlColorScaleBiasInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (isColorMatrixData(tint)) {
    promoteGlColorScaleBiasToMatrix(runtime, instanceIndex);
    writeGlColorMatrixInstance(runtime, tint, instanceIndex);
    return;
  }
  writeGlColorScaleBiasInstance(runtime, tint, instanceIndex);
}

function writeGlColorMatrixInstance(
  runtime: GlRenderStateRuntime,
  adjustment: Readonly<ColorAdjustmentData> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  let data = runtime.quadBatchWriterColorMatrixData;
  if (data === undefined) {
    data = new Float32Array(COLOR_MATRIX_FLOATS * 256);
    runtime.quadBatchWriterColorMatrixData = data;
  } else if (offset + COLOR_MATRIX_FLOATS > data.length) {
    const grown = new Float32Array(Math.max(offset + COLOR_MATRIX_FLOATS, data.length * 2));
    grown.set(data);
    runtime.quadBatchWriterColorMatrixData = grown;
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
      data[offset + 16 + row] = adjustment[source + 4]!;
    }
  } else {
    writeIdentityColorMatrix(data, offset);
    for (let channel = 0; channel < 4; channel++) {
      data[offset + channel * 4 + channel] = getColorScale(adjustment, channel);
      data[offset + 16 + channel] = getColorBias(adjustment, channel);
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
  const out = runtime.quadBatchWriterColorMatrixData!;
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
  const out = runtime.quadBatchWriterColorMatrixData!;
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  for (let channel = 0; channel < 4; channel++) {
    out[offset + channel * 4 + channel] = affine[affineOffset + channel]!;
    out[offset + 16 + channel] = affine[affineOffset + 4 + channel]!;
  }
}

// Writes one instance's eight color scale/bias floats at its slot in the batch data, growing the array
// as needed. Bias is already normalized-linear and is copied verbatim. A null value writes identity.
function writeGlColorScaleBiasInstance(
  runtime: GlRenderStateRuntime,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_SCALE_BIAS_FLOATS;
  let data = runtime.quadBatchWriterColorScaleBiasData;
  if (data === undefined) {
    data = new Float32Array(COLOR_SCALE_BIAS_FLOATS * 256);
    runtime.quadBatchWriterColorScaleBiasData = data;
  }
  if (offset + COLOR_SCALE_BIAS_FLOATS > data.length) {
    const newSize = Math.max(offset + COLOR_SCALE_BIAS_FLOATS, data.length * 2);
    const grown = new Float32Array(newSize);
    grown.set(data);
    runtime.quadBatchWriterColorScaleBiasData = grown;
    data = grown;
  }
  if (colorScaleBias !== null) {
    for (let channel = 0; channel < 4; channel++) {
      data[offset + channel] = getColorScale(colorScaleBias, channel);
      data[offset + 4 + channel] = getColorBias(colorScaleBias, channel);
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
  let data = runtime.quadBatchWriterColorTintData;
  if (data === undefined) {
    data = new Uint32Array(256);
    runtime.quadBatchWriterColorTintData = data;
  } else if (instanceIndex >= data.length) {
    const grown = new Uint32Array(Math.max(instanceIndex + 1, data.length * 2));
    grown.set(data);
    runtime.quadBatchWriterColorTintData = grown;
    data = grown;
  }
  data[instanceIndex] = rgbaToNativeByteWord(rgba);
}

function writeGlNativePackedTintAsColorScaleBias(
  runtime: GlRenderStateRuntime,
  nativeWord: number,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_SCALE_BIAS_FLOATS;
  writeGlColorScaleBiasInstance(runtime, null, instanceIndex);
  const data = runtime.quadBatchWriterColorScaleBiasData!;
  data[offset] = (nativeWord & 0xff) / 255;
  data[offset + 1] = ((nativeWord >>> 8) & 0xff) / 255;
  data[offset + 2] = ((nativeWord >>> 16) & 0xff) / 255;
  data[offset + 3] = ((nativeWord >>> 24) & 0xff) / 255;
}

function getPackedTint(value: Readonly<ColorScaleBias | TintMaterialData> | null): number | null {
  if (value === null) return 0xffffffff;
  if (isTintMaterialData(value)) return value.tint >>> 0;
  if (
    value.redBias !== 0 ||
    value.greenBias !== 0 ||
    value.blueBias !== 0 ||
    value.alphaBias !== 0 ||
    value.redScale < 0 ||
    value.redScale > 1 ||
    value.greenScale < 0 ||
    value.greenScale > 1 ||
    value.blueScale < 0 ||
    value.blueScale > 1 ||
    value.alphaScale < 0 ||
    value.alphaScale > 1
  ) {
    return null;
  }
  return (
    ((Math.round(value.redScale * 255) << 24) |
      (Math.round(value.greenScale * 255) << 16) |
      (Math.round(value.blueScale * 255) << 8) |
      Math.round(value.alphaScale * 255)) >>>
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

function isTintMaterialData(value: Readonly<ColorScaleBias | TintMaterialData>): value is Readonly<TintMaterialData> {
  return 'tint' in value;
}

function getColorScale(value: Readonly<ColorScaleBias | TintMaterialData>, channel: number): number {
  if (isTintMaterialData(value)) return ((value.tint >>> (24 - channel * 8)) & 0xff) / 255;
  if (channel === 0) return value.redScale;
  if (channel === 1) return value.greenScale;
  if (channel === 2) return value.blueScale;
  return value.alphaScale;
}

function getColorBias(value: Readonly<ColorScaleBias | TintMaterialData>, channel: number): number {
  if (isTintMaterialData(value)) return 0;
  if (channel === 0) return value.redBias;
  if (channel === 1) return value.greenBias;
  if (channel === 2) return value.blueBias;
  return value.alphaBias;
}

// Draws the GPU-tessellated solid-fill meshes tinted by the node's color adjustment. A single mesh is
// one flat color and a shape shares one whole-node transform, so this is the uniform path (CT_MODE_
// UNIFORM's mesh analogue): u_colorScale/u_colorBias uploaded once, no per-vertex tint data. Reuses the base
// mesh draw driver and its shared vertex/index buffers — only the fragment program differs, so the
// projection and per-mesh premultiplied color stay identical to the untinted path. Falls back to the
// lean program when the node happens to carry no transform (the caller gates on non-null, but the fold
// stays correct if reached directly).
function drawGlShapeMeshesColorScaleBias(
  state: GlRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly GlShapeMesh[],
): void {
  const colorMatrix = renderProxy.colorMatrix;
  const colorScaleBias = renderProxy.colorScaleBias;
  const base = ensureGlShapeMeshProgram(state);
  if (colorMatrix == null && colorScaleBias === null) {
    drawGlShapeMeshBatch(state, renderProxy, meshes, base);
    return;
  }
  const shader =
    colorMatrix == null ? ensureGlShapeMeshColorScaleBiasShader(state) : ensureGlShapeMeshColorMatrixShader(state);
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
      gl.uniform4f(locations[4]!, colorMatrix[4]!, colorMatrix[9]!, colorMatrix[14]!, colorMatrix[19]!);
      return;
    }
    gl.uniform4f(
      shader.colorScaleLocation,
      colorScaleBias!.redScale,
      colorScaleBias!.greenScale,
      colorScaleBias!.blueScale,
      colorScaleBias!.alphaScale,
    );
    gl.uniform4f(
      shader.colorBiasLocation,
      colorScaleBias!.redBias,
      colorScaleBias!.greenBias,
      colorScaleBias!.blueBias,
      colorScaleBias!.alphaBias,
    );
  });
}

function ensureGlShapeMeshColorMatrixShader(state: GlRenderState): GlShapeMeshColorScaleBiasShader {
  const runtime = getGlRenderStateRuntime(state);
  const smr = runtime.context.shapeMeshResources!;
  if (smr.colorMatrixShader) return smr.colorMatrixShader;
  const gl = state.gl;
  const program = createGlProgram(gl, SHAPE_MESH_CT_VS, SHAPE_MESH_MATRIX_FS, 'Shape-mesh color matrix');
  const shader: GlShapeMeshColorScaleBiasShader = {
    program,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    matrixLocation: gl.getUniformLocation(program, 'u_matrix'),
    colorLocation: gl.getUniformLocation(program, 'u_color'),
    colorScaleLocation: null,
    colorBiasLocation: null,
    colorMatrixLocations: [
      gl.getUniformLocation(program, 'u_ctRow0'),
      gl.getUniformLocation(program, 'u_ctRow1'),
      gl.getUniformLocation(program, 'u_ctRow2'),
      gl.getUniformLocation(program, 'u_ctRow3'),
      gl.getUniformLocation(program, 'u_colorBias'),
    ],
  };
  smr.colorMatrixShader = shader;
  return shader;
}

function ensureGlShapeMeshColorScaleBiasShader(state: GlRenderState): GlShapeMeshColorScaleBiasShader {
  const runtime = getGlRenderStateRuntime(state);
  const smr = runtime.context.shapeMeshResources!;
  if (smr.colorScaleBiasShader) return smr.colorScaleBiasShader;

  const gl = state.gl;
  const program = createGlProgram(gl, SHAPE_MESH_CT_VS, SHAPE_MESH_CT_FS, 'Shape-mesh color adjustment');
  const shader: GlShapeMeshColorScaleBiasShader = {
    program,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    matrixLocation: gl.getUniformLocation(program, 'u_matrix'),
    colorLocation: gl.getUniformLocation(program, 'u_color'),
    colorScaleLocation: gl.getUniformLocation(program, 'u_colorScale'),
    colorBiasLocation: gl.getUniformLocation(program, 'u_colorBias'),
  };
  smr.colorScaleBiasShader = shader;
  return shader;
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

// The tint fragment shader. u_color arrives premultiplied (the driver uploads color·alpha), so the math
// un-premultiplies, applies normalized-linear scale/bias, clamps, and re-premultiplies — byte-for-byte
// with the quad-batch uniform/instanced color-adjustment shaders.
const SHAPE_MESH_CT_FS = `
precision mediump float;
uniform vec4 u_color;
uniform vec4 u_colorScale;
uniform vec4 u_colorBias;
${GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
void main() {
  vec4 color = u_color;
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorAdjustment(color, u_colorScale, u_colorBias);
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
uniform vec4 u_colorBias;
${GL_COLOR_MATRIX_FRAGMENT_CHUNK}
void main() {
  vec4 color = u_color;
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = applyFlightColorMatrix(color, u_ctRow0, u_ctRow1, u_ctRow2, u_ctRow3, u_colorBias);
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}
`;

const glColorAdjustmentMaterialFeature: GlColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: GL_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
  matrixFragmentShaderChunk: GL_COLOR_MATRIX_FRAGMENT_CHUNK,
  drawShapeMeshes: drawGlShapeMeshesColorScaleBias,
  flush: flushGlColorAdjustmentMaterialFeature,
  record: recordGlColorAdjustment,
};
