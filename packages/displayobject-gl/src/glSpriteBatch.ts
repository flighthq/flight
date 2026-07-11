import { bindGlTexture } from '@flighthq/render-gl';
import { createGlProgram } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type {
  BlendMode,
  ColorTransform,
  GlMaterialRenderer,
  GlRenderState,
  GlRenderStateRuntime,
  Material,
  MaterialData,
} from '@flighthq/types';
import type {
  GlColorTransformInstancedShader,
  GlQuadBatchShader,
  GlUniformColorTransformShader,
} from '@flighthq/types';

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

// Per-instance color-transform layout (8 floats = 32 bytes): 4 multiplier + 4 offset, at attribute
// locations 7 (a_ctMult) and 8 (a_ctOff). Used only when a batch carries varying tints (mode 2).
const COLOR_TRANSFORM_FLOATS = 8;
const COLOR_TRANSFORM_STRIDE = COLOR_TRANSFORM_FLOATS * 4;

// Color-transform fold modes for the active sprite batch. See GlRenderStateRuntime for the promotion
// rules. NONE keeps the lean base shader; UNIFORM binds one whole-batch tint; PER_INSTANCE packs a
// tint per instance.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PER_INSTANCE = 2;

// Highest per-instance attribute location any sprite-batch material or the color-transform stage may
// use. Divisors for locations 1..this are reset after each flush so later non-instanced draws are not
// corrupted.
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
  const ctMode = runtime.spriteBatchColorTransformMode;
  const uniformColorTransform = runtime.spriteBatchUniformColorTransform;
  runtime.spriteBatchCount = 0;
  runtime.spriteBatchTexture = null;
  runtime.spriteBatchBlendMode = null;
  runtime.spriteBatchMaterial = null;
  runtime.spriteBatchMaterialRenderer = null;
  runtime.spriteBatchMaterialFloats = 0;
  runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  runtime.spriteBatchUniformColorTransform = null;

  const gl = state.gl;

  if (runtime.spriteBatchInstanceBuffer === null) {
    runtime.spriteBatchInstanceBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceData.byteLength, gl.DYNAMIC_DRAW);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchInstanceBuffer);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, runtime.spriteBatchInstanceData, 0, count * SPRITE_INSTANCE_FLOATS);

  if (ctMode === CT_MODE_NONE && floats > 0) {
    if (runtime.spriteBatchMaterialBuffer === null) {
      runtime.spriteBatchMaterialBuffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialData.byteLength, gl.DYNAMIC_DRAW);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchMaterialBuffer);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, runtime.spriteBatchMaterialData, 0, count * floats);
  }

  if (ctMode === CT_MODE_PER_INSTANCE) {
    if (runtime.spriteBatchColorTransformBuffer === null) {
      runtime.spriteBatchColorTransformBuffer = gl.createBuffer()!;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, runtime.spriteBatchColorTransformBuffer);
    // Reallocate to exactly what is drawn: the color-transform data array grows lazily as tints are
    // recorded, so a fixed subData offset could outrun a stale buffer. Only per-instance-tinted
    // batches pay this, and the untinted common path never allocates the buffer at all.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      runtime.spriteBatchColorTransformData.subarray(0, count * COLOR_TRANSFORM_FLOATS),
      gl.DYNAMIC_DRAW,
    );
  }

  state.applyBlendMode?.(state, blendMode);
  bindGlTexture(state, texture);

  if (ctMode === CT_MODE_UNIFORM) {
    bindGlSpriteBatchUniformColorTransform(state, uniformColorTransform!);
  } else if (ctMode === CT_MODE_PER_INSTANCE) {
    bindGlSpriteBatchInstancedColorTransform(state);
  } else {
    // Resolved renderer owns program selection, uniforms, and all attribute setup (base + its own).
    renderer.bind(state, material);
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, runtime.quadIndexBuffer);
  gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, count);

  for (let loc = 1; loc <= MAX_INSTANCE_ATTRIB_LOCATION; loc++) {
    gl.vertexAttribDivisor(loc, 0);
  }
}

// Writes one instance's per-instance material floats into the active material buffer at the given
// instance index, converting the supplied per-instance materialData. No-op for uniform-only
// materials (no packInstance / floats === 0). Color transform is folded separately by
// recordGlSpriteBatchColorTransform — it is not a material.
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
// compared by reference) or capacity is exceeded. The color transform is orthogonal — it never keys
// the batch. Returns the float index in spriteBatchInstanceData where the caller should begin writing
// base instance data; the caller increments state.spriteBatchCount and records per-instance data.
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

// Records instance `instanceIndex`'s effective color transform into the active batch, folding it into
// the draw without ever splitting the batch. A batch starts untinted (mode NONE); the first tint on
// instance 0 makes it a whole-batch UNIFORM; a diverging tint (or an untinted instance following a
// tinted one) promotes it to PER_INSTANCE, back-filling the already-recorded instances with the prior
// uniform value (or identity). `colorTransform` is null for an untinted instance.
export function recordGlSpriteBatchColorTransform(
  state: GlRenderState,
  colorTransform: ColorTransform | null | undefined,
  instanceIndex: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const mode = runtime.spriteBatchColorTransformMode;
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
    const uniform = runtime.spriteBatchUniformColorTransform;
    if (equalsRecordedColorTransform(tint, uniform)) return;
    promoteGlSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, uniform);
    writeGlColorTransformInstance(runtime, tint, instanceIndex);
    return;
  }

  writeGlColorTransformInstance(runtime, tint, instanceIndex);
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

// Writes one instance's eight color-transform floats (multiplier rgba, then offset rgba normalized by
// 255) at its slot in the batch's color-transform data, growing the array as needed. A null transform
// writes the identity (multiply by 1, add 0).
function writeGlColorTransformInstance(
  runtime: GlRenderStateRuntime,
  colorTransform: Readonly<ColorTransform> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_TRANSFORM_FLOATS;
  if (offset + COLOR_TRANSFORM_FLOATS > runtime.spriteBatchColorTransformData.length) {
    const newSize = Math.max(offset + COLOR_TRANSFORM_FLOATS, runtime.spriteBatchColorTransformData.length * 2);
    const grown = new Float32Array(newSize);
    grown.set(runtime.spriteBatchColorTransformData);
    runtime.spriteBatchColorTransformData = grown;
  }
  const out = runtime.spriteBatchColorTransformData;
  if (colorTransform !== null) {
    out[offset] = colorTransform.redMultiplier;
    out[offset + 1] = colorTransform.greenMultiplier;
    out[offset + 2] = colorTransform.blueMultiplier;
    out[offset + 3] = colorTransform.alphaMultiplier;
    out[offset + 4] = colorTransform.redOffset / 255;
    out[offset + 5] = colorTransform.greenOffset / 255;
    out[offset + 6] = colorTransform.blueOffset / 255;
    out[offset + 7] = colorTransform.alphaOffset / 255;
  } else {
    out[offset] = 1;
    out[offset + 1] = 1;
    out[offset + 2] = 1;
    out[offset + 3] = 1;
    out[offset + 4] = 0;
    out[offset + 5] = 0;
    out[offset + 6] = 0;
    out[offset + 7] = 0;
  }
}
