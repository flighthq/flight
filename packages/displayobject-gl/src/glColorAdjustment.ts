import { createGlProgram } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type {
  ColorTransform,
  GlColorAdjustmentFold,
  GlColorTransformInstancedShader,
  GlRenderState,
  GlRenderStateRuntime,
  GlUniformColorTransformShader,
} from '@flighthq/types';

import {
  bindGlQuadBatchBaseAttributes,
  QUAD_BATCH_VS,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glSpriteBatch';

// Enables the opt-in inline color-adjustment fold on a WebGL render state: the fused-color-matrix
// stage the sprite/quad batch draws through so a color transform (and, later, other pointwise
// adjustments) folds into the batch as data — a whole-batch uniform tint or per-instance
// a_ctMult/a_ctOff attributes, chosen by data cardinality — without ever splitting the batch. Until a
// state calls this, its batch renderer carries none of this module's shader code (it tree-shakes out)
// and recordGlSpriteBatchColorTransform silently skips every tint. Idempotent; safe to call per state.
export function enableGlColorAdjustment(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  runtime.glColorAdjustmentFold = glColorAdjustmentFold;
  if (runtime.spriteBatchColorTransformMode === undefined) runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  if (runtime.spriteBatchColorTransformData === undefined) {
    runtime.spriteBatchColorTransformData = new Float32Array(COLOR_TRANSFORM_FLOATS * 256);
  }
}

// Per-instance color-transform layout (8 floats = 32 bytes): 4 multiplier + 4 offset, at attribute
// locations 7 (a_ctMult) and 8 (a_ctOff). Used only when a batch carries varying tints (mode 2).
const COLOR_TRANSFORM_FLOATS = 8;
const COLOR_TRANSFORM_STRIDE = COLOR_TRANSFORM_FLOATS * 4;

// Color-adjustment fold modes for the active sprite batch. NONE keeps the lean base shader; UNIFORM
// binds one whole-batch tint; PER_INSTANCE packs a tint per instance. A batch starts at NONE, rises to
// UNIFORM on the first tint, and promotes to PER_INSTANCE — back-filling already-written instances
// with the prior value/identity — when tints diverge, so a tint only ever promotes a batch, never
// splits it.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PER_INSTANCE = 2;

// Per-instance color-transform program: the base quad-batch vertex work plus two vec4 instance
// attributes (a_ctMult / a_ctOff) carried through to the fragment stage. The color-transform math is
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

// Whole-batch color-transform fragment shader (over the base vertex shader): one tint uploaded as
// u_ctMult/u_ctOff uniforms and shared by every instance. This is the uniform path — a single tint on
// a whole batch (e.g. a bitmap-text node) costs no per-instance data.
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

// Binds the whole-batch (uniform) color-transform program and uploads the shared tint. Base
// attributes come from the standard instance buffer; there is no per-instance tint data.
function bindGlSpriteBatchUniformColorTransform(state: GlRenderState, colorTransform: Readonly<ColorTransform>): void {
  const shader = ensureGlUniformColorTransformShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture);

  const gl = state.gl;
  gl.uniform4f(
    shader.locColorMultiplier,
    colorTransform.redMultiplier,
    colorTransform.greenMultiplier,
    colorTransform.blueMultiplier,
    colorTransform.alphaMultiplier,
  );
  gl.uniform4f(
    shader.locColorOffset,
    colorTransform.redOffset / 255,
    colorTransform.greenOffset / 255,
    colorTransform.blueOffset / 255,
    colorTransform.alphaOffset / 255,
  );
  bindGlQuadBatchBaseAttributes(state, shader.locCorner);
}

// Binds the per-instance color-transform program and the a_ctMult/a_ctOff attribute stream from the
// batch's color-transform buffer, alongside the base instance attributes.
function bindGlSpriteBatchInstancedColorTransform(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  const shader = ensureGlColorTransformInstancedShader(state);
  useGlQuadBatchProgram(state, shader.program);
  setGlQuadBatchWorldAndTexture(state, shader.locWorldMatrix, shader.locTexture);
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
  };
  return runtime.colorTransformInstancedShader;
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
    locColorMultiplier: gl.getUniformLocation(program, 'u_ctMult')!,
    locColorOffset: gl.getUniformLocation(program, 'u_ctOff')!,
  };
  return runtime.uniformColorTransformShader;
}

// Value equality for the whole-batch uniform check: reference-equal short-circuits (the common case —
// every glyph of a bitmap-text node shares one node-level tint), else compares all eight fields so a
// distinct-but-equal tint still keeps the batch on the cheaper uniform path.
function equalsRecordedColorTransform(a: Readonly<ColorTransform> | null, b: Readonly<ColorTransform> | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.redMultiplier === b.redMultiplier &&
    a.greenMultiplier === b.greenMultiplier &&
    a.blueMultiplier === b.blueMultiplier &&
    a.alphaMultiplier === b.alphaMultiplier &&
    a.redOffset === b.redOffset &&
    a.greenOffset === b.greenOffset &&
    a.blueOffset === b.blueOffset &&
    a.alphaOffset === b.alphaOffset
  );
}

// Uploads the active batch's per-instance color-transform buffer, selects the fold program (uniform or
// per-instance), and binds it. Returns true when it drew a folded batch; false when the batch carried
// no tint, so flushGlSpriteBatch runs the lean material path instead. Resets the fold mode for the
// next batch.
function flushGlColorAdjustmentFold(state: GlRenderState, count: number): boolean {
  const runtime = getGlRenderStateRuntime(state);
  const ctMode = runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE;
  if (ctMode === CT_MODE_NONE) return false;
  const uniformColorTransform = runtime.spriteBatchUniformColorTransform ?? null;
  runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  runtime.spriteBatchUniformColorTransform = null;

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

  bindGlSpriteBatchUniformColorTransform(state, uniformColorTransform!);
  return true;
}

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instanceCount) with `fill` (a prior uniform value, or null → identity), so promotion never
// changes the appearance of instances written before the divergence.
function promoteGlSpriteBatchColorTransformToPerInstance(
  runtime: GlRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorTransform> | null,
): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PER_INSTANCE;
  for (let i = 0; i < instanceCount; i++) writeGlColorTransformInstance(runtime, fill, i);
}

// Folds instance `instanceIndex`'s effective color transform into the active batch. See the fold-mode
// constants for the promotion rules. `colorTransform` is null for an untinted instance.
function recordGlColorAdjustment(
  runtime: GlRenderStateRuntime,
  colorTransform: ColorTransform | null | undefined,
  instanceIndex: number,
): void {
  if (runtime.spriteBatchColorTransformData === undefined) {
    runtime.spriteBatchColorTransformData = new Float32Array(COLOR_TRANSFORM_FLOATS * 256);
  }
  const mode = runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE;
  const tint = colorTransform ?? null;

  if (mode === CT_MODE_NONE) {
    if (tint === null) return;
    if (instanceIndex === 0) {
      runtime.spriteBatchColorTransformMode = CT_MODE_UNIFORM;
      runtime.spriteBatchUniformColorTransform = tint;
      return;
    }
    promoteGlSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, null);
    writeGlColorTransformInstance(runtime, tint, instanceIndex);
    return;
  }

  if (mode === CT_MODE_UNIFORM) {
    const uniform = runtime.spriteBatchUniformColorTransform ?? null;
    if (equalsRecordedColorTransform(tint, uniform)) return;
    promoteGlSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, uniform);
    writeGlColorTransformInstance(runtime, tint, instanceIndex);
    return;
  }

  writeGlColorTransformInstance(runtime, tint, instanceIndex);
}

// Writes one instance's eight color-transform floats (multiplier rgba, then offset rgba normalized by
// 255) at its slot in the batch's color-transform data, growing the array as needed. A null transform
// writes the identity (multiply by 1, add 0).
function writeGlColorTransformInstance(
  runtime: GlRenderStateRuntime,
  colorTransform: Readonly<ColorTransform> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_TRANSFORM_FLOATS;
  let data = runtime.spriteBatchColorTransformData!;
  if (offset + COLOR_TRANSFORM_FLOATS > data.length) {
    const newSize = Math.max(offset + COLOR_TRANSFORM_FLOATS, data.length * 2);
    const grown = new Float32Array(newSize);
    grown.set(data);
    runtime.spriteBatchColorTransformData = grown;
    data = grown;
  }
  if (colorTransform !== null) {
    data[offset] = colorTransform.redMultiplier;
    data[offset + 1] = colorTransform.greenMultiplier;
    data[offset + 2] = colorTransform.blueMultiplier;
    data[offset + 3] = colorTransform.alphaMultiplier;
    data[offset + 4] = colorTransform.redOffset / 255;
    data[offset + 5] = colorTransform.greenOffset / 255;
    data[offset + 6] = colorTransform.blueOffset / 255;
    data[offset + 7] = colorTransform.alphaOffset / 255;
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

const glColorAdjustmentFold: GlColorAdjustmentFold = {
  flush: flushGlColorAdjustmentFold,
  record: recordGlColorAdjustment,
};
