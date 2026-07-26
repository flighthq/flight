import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  ColorScaleBias,
  WgpuColorAdjustmentFlush,
  WgpuColorAdjustmentMaterialFeature,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  TintMaterialData,
} from '@flighthq/types';

import { getWgpuQuadBatchPreludeWGSL } from './wgpuSpriteBatch';

// Enables the opt-in inline color-adjustment fold on a WebGPU render state: the fused-color-matrix
// scene2d the sprite/quad batch draws through so a color adjustment (and, later, other pointwise
// adjustments) folds into the batch as per-instance storage data at @group(3) — replicated across the
// batch for a whole-batch tint, or varied per instance — without ever splitting the batch. Until a
// state calls this, its batch renderer carries none of this module's WGSL (it tree-shakes out) and
// recordWgpuSpriteBatchColorScaleBias silently skips every tint. Idempotent; safe to call per state.
export function registerWgpuColorAdjustmentMaterialFeature(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.wgpuColorAdjustmentMaterialFeature = wgpuColorAdjustmentMaterialFeature;
  if (runtime.spriteBatchColorScaleBiasMode === undefined) runtime.spriteBatchColorScaleBiasMode = CT_MODE_NONE;
}

// Per-instance color-adjustment data (8 floats = 4 scale + 4 bias). Wgpu carries every tint
// through the per-instance storage buffer, so a whole-batch (uniform) tint is the same value on each
// instance — there is no separate hardware-uniform path.
const COLOR_SCALE_BIAS_FLOATS = 8;
const COLOR_MATRIX_FLOATS = 20;

// Color-adjustment fold modes for the active sprite batch. NONE keeps the base module; UNIFORM defers
// per-instance fill while one tint covers the whole batch; PER_INSTANCE packs a tint per instance.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PACKED_TINT = 2;
const CT_MODE_PER_INSTANCE = 3;
const CT_MODE_MATRIX = 4;

type ColorAdjustmentData = ColorScaleBias | TintMaterialData | readonly number[];

// The backend's single color-adjustment shader chunk. The registered feature carries it to Standard
// 2D and promoted 3D family variants without making their lean compilers statically own the code.
const WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK = /* wgsl */ `
fn applyFlightColorAdjustment(color : vec4f, multiplier : vec4f, offset : vec4f) -> vec4f {
  return clamp(color * multiplier + offset, vec4f(0.0), vec4f(1.0));
}
`;
const WGPU_COLOR_MATRIX_FRAGMENT_CHUNK = /* wgsl */ `
fn applyFlightColorMatrix(
  color : vec4f,
  row0 : vec4f,
  row1 : vec4f,
  row2 : vec4f,
  row3 : vec4f,
  offset : vec4f,
) -> vec4f {
  return clamp(vec4f(dot(row0, color), dot(row1, color), dot(row2, color), dot(row3, color)) + offset,
    vec4f(0.0), vec4f(1.0));
}
`;

// Folds instance `instanceIndex`'s effective color adjustment into the active batch. See the fold-mode
// constants for the promotion rules. `colorScaleBias` is null for an untinted instance.
function recordWgpuColorAdjustment(
  runtime: WgpuRenderStateRuntime,
  colorScaleBias: ColorAdjustmentData | null | undefined,
  instanceIndex: number,
): void {
  const mode = runtime.spriteBatchColorScaleBiasMode ?? CT_MODE_NONE;
  const tint = colorScaleBias ?? null;

  if (mode === CT_MODE_MATRIX) {
    writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
    return;
  }

  if (mode === CT_MODE_NONE) {
    if (tint === null) return;
    if (instanceIndex === 0) {
      runtime.spriteBatchColorScaleBiasMode = CT_MODE_UNIFORM;
      runtime.spriteBatchUniformColorScaleBias = tint;
      return;
    }
    if (isColorMatrixData(tint)) {
      promoteWgpuSpriteBatchColorScaleBiasToMatrix(runtime, instanceIndex, null);
      writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (packedTint !== null) {
      promoteWgpuSpriteBatchColorScaleBiasToPackedTint(runtime, instanceIndex, null);
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuSpriteBatchColorScaleBiasToPerInstance(runtime, instanceIndex, null);
      writeWgpuColorScaleBiasInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_UNIFORM) {
    const uniform = runtime.spriteBatchUniformColorScaleBias ?? null;
    if (equalsRecordedColorScaleBias(tint, uniform)) return;
    if (isColorMatrixData(tint) || (uniform !== null && isColorMatrixData(uniform))) {
      promoteWgpuSpriteBatchColorScaleBiasToMatrix(runtime, instanceIndex, uniform);
      writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (getPackedTint(uniform) !== null && packedTint !== null) {
      promoteWgpuSpriteBatchColorScaleBiasToPackedTint(runtime, instanceIndex, uniform);
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuSpriteBatchColorScaleBiasToPerInstance(runtime, instanceIndex, uniform);
      writeWgpuColorScaleBiasInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_PACKED_TINT) {
    if (isColorMatrixData(tint)) {
      promoteWgpuPackedTintToColorMatrix(runtime, instanceIndex);
      writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (packedTint !== null) {
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuPackedTintToColorScaleBias(runtime, instanceIndex);
      writeWgpuColorScaleBiasInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (isColorMatrixData(tint)) {
    promoteWgpuColorScaleBiasToMatrix(runtime, instanceIndex);
    writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
    return;
  }
  writeWgpuColorScaleBiasInstance(runtime, tint, instanceIndex);
}

// Resolves the active batch's folded realization: replicates a whole-batch uniform tint across the
// batch, then returns the per-instance storage data + the folded shader module. Returns null when the
// batch carried no tint, so flushWgpuSpriteBatch runs the lean material path. Resets the fold mode for
// the next batch.
function resolveWgpuColorAdjustmentFlush(state: WgpuRenderState, count: number): WgpuColorAdjustmentFlush | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const ctMode = runtime.spriteBatchColorScaleBiasMode ?? CT_MODE_NONE;
  if (ctMode === CT_MODE_NONE) return null;
  if (ctMode === CT_MODE_UNIFORM) {
    const uniform = runtime.spriteBatchUniformColorScaleBias!;
    if (isColorMatrixData(uniform)) {
      runtime.spriteBatchColorScaleBiasMode = CT_MODE_MATRIX;
      fillWgpuSpriteBatchUniformColorMatrix(runtime, uniform, count);
    } else {
      const packedTint = getPackedTint(uniform);
      if (packedTint !== null) {
        runtime.spriteBatchColorScaleBiasMode = CT_MODE_PACKED_TINT;
        fillWgpuSpriteBatchUniformPackedTint(runtime, packedTint, count);
      } else {
        runtime.spriteBatchColorScaleBiasMode = CT_MODE_PER_INSTANCE;
        fillWgpuSpriteBatchUniformColorScaleBias(runtime, uniform, count);
      }
    }
  }
  const resolvedMode = runtime.spriteBatchColorScaleBiasMode;
  runtime.spriteBatchColorScaleBiasMode = CT_MODE_NONE;
  runtime.spriteBatchUniformColorScaleBias = null;
  if (resolvedMode === CT_MODE_PACKED_TINT) {
    return {
      data: runtime.spriteBatchColorTintData!,
      floats: 1,
      module: getWgpuSpriteBatchPackedTintModule(state),
    };
  }
  if (resolvedMode === CT_MODE_MATRIX) {
    return {
      data: runtime.spriteBatchColorMatrixData!,
      floats: COLOR_MATRIX_FLOATS,
      module: getWgpuSpriteBatchColorMatrixModule(state),
    };
  }
  return {
    data: runtime.spriteBatchColorScaleBiasData!,
    floats: COLOR_SCALE_BIAS_FLOATS,
    module: getWgpuSpriteBatchColorScaleBiasModule(state),
  };
}

// Value equality for the whole-batch uniform check: reference-equal short-circuits (every glyph of a
// bitmap-text node shares one node-level tint), else compares all eight fields.
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

// Grows the color-adjustment data array to hold `floatsNeeded` floats, preserving already-recorded
// per-instance data.
function ensureWgpuColorScaleBiasCapacity(runtime: WgpuRenderStateRuntime, floatsNeeded: number): void {
  const existing = runtime.spriteBatchColorScaleBiasData;
  if (existing !== undefined && floatsNeeded <= existing.length) return;
  const newSize = Math.max(floatsNeeded, (existing?.length ?? 0) * 2, COLOR_SCALE_BIAS_FLOATS * 256);
  const grown = new Float32Array(newSize);
  if (existing !== undefined) grown.set(existing);
  runtime.spriteBatchColorScaleBiasData = grown;
}

// Replicates a whole-batch uniform tint across `count` instances at flush time — Wgpu has no separate
// hardware-uniform tint path, so a uniform is the same value on every instance of the storage buffer.
function fillWgpuSpriteBatchUniformColorScaleBias(
  runtime: WgpuRenderStateRuntime,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData>,
  count: number,
): void {
  ensureWgpuColorScaleBiasCapacity(runtime, count * COLOR_SCALE_BIAS_FLOATS);
  for (let i = 0; i < count; i++) writeWgpuColorScaleBiasInstance(runtime, colorScaleBias, i);
}

function fillWgpuSpriteBatchUniformPackedTint(runtime: WgpuRenderStateRuntime, rgba: number, count: number): void {
  for (let i = 0; i < count; i++) writeWgpuPackedTintInstance(runtime, rgba, i);
}

function fillWgpuSpriteBatchUniformColorMatrix(
  runtime: WgpuRenderStateRuntime,
  matrix: readonly number[],
  count: number,
): void {
  for (let i = 0; i < count; i++) writeWgpuColorMatrixInstance(runtime, matrix, i);
}

// The folded per-instance color-adjustment shader module (cached per device): the base sprite-batch
// prelude plus a scene2d that reads 8 per-instance floats from the material storage buffer (@group(3))
// and applies `color * mult + offset` in unpremultiplied space. Reused verbatim from the former
// color-adjustment material so premultiplied-alpha handling is unchanged.
function getWgpuSpriteBatchColorScaleBiasModule(state: WgpuRenderState): GPUShaderModule {
  const cached = _colorScaleBiasModules.get(state.device);
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + COLOR_SCALE_BIAS_WGSL,
  });
  _colorScaleBiasModules.set(state.device, module);
  return module;
}

function getWgpuSpriteBatchPackedTintModule(state: WgpuRenderState): GPUShaderModule {
  const cached = _packedTintModules.get(state.device);
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + PACKED_TINT_WGSL,
  });
  _packedTintModules.set(state.device, module);
  return module;
}

function getWgpuSpriteBatchColorMatrixModule(state: WgpuRenderState): GPUShaderModule {
  const cached = _colorMatrixModules.get(state.device);
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + COLOR_MATRIX_WGSL,
  });
  _colorMatrixModules.set(state.device, module);
  return module;
}

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instanceCount) with `fill` (a prior uniform value, or null → identity).
function promoteWgpuSpriteBatchColorScaleBiasToPerInstance(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorScaleBias | TintMaterialData> | null,
): void {
  runtime.spriteBatchColorScaleBiasMode = CT_MODE_PER_INSTANCE;
  for (let i = 0; i < instanceCount; i++) writeWgpuColorScaleBiasInstance(runtime, fill, i);
}

function promoteWgpuSpriteBatchColorScaleBiasToPackedTint(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorScaleBias | TintMaterialData> | null,
): void {
  runtime.spriteBatchColorScaleBiasMode = CT_MODE_PACKED_TINT;
  for (let i = 0; i < instanceCount; i++) writeWgpuPackedTintInstance(runtime, getPackedTint(fill)!, i);
}

function promoteWgpuPackedTintToColorScaleBias(runtime: WgpuRenderStateRuntime, instanceCount: number): void {
  runtime.spriteBatchColorScaleBiasMode = CT_MODE_PER_INSTANCE;
  const packed = runtime.spriteBatchColorTintData!;
  for (let i = 0; i < instanceCount; i++) writeWgpuNativePackedTintAsColorScaleBias(runtime, packed[i], i);
}

function promoteWgpuSpriteBatchColorScaleBiasToMatrix(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorAdjustmentData> | null,
): void {
  runtime.spriteBatchColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeWgpuColorMatrixInstance(runtime, fill, i);
}

function promoteWgpuPackedTintToColorMatrix(runtime: WgpuRenderStateRuntime, instanceCount: number): void {
  const packed = runtime.spriteBatchColorTintData!;
  runtime.spriteBatchColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeWgpuNativePackedTintAsColorMatrix(runtime, packed[i], i);
}

function promoteWgpuColorScaleBiasToMatrix(runtime: WgpuRenderStateRuntime, instanceCount: number): void {
  const affine = runtime.spriteBatchColorScaleBiasData!;
  runtime.spriteBatchColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) {
    writeWgpuAffineValuesAsColorMatrix(runtime, affine, i * COLOR_SCALE_BIAS_FLOATS, i);
  }
}

// Writes one instance's eight color scale/bias floats at its slot, growing the array as needed. Bias is
// already normalized-linear and is copied verbatim. A null value writes identity.
function writeWgpuColorScaleBiasInstance(
  runtime: WgpuRenderStateRuntime,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_SCALE_BIAS_FLOATS;
  ensureWgpuColorScaleBiasCapacity(runtime, offset + COLOR_SCALE_BIAS_FLOATS);
  const out = runtime.spriteBatchColorScaleBiasData!;
  if (colorScaleBias !== null) {
    for (let channel = 0; channel < 4; channel++) {
      out[offset + channel] = getColorScale(colorScaleBias, channel);
      out[offset + 4 + channel] = getColorBias(colorScaleBias, channel);
    }
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

function writeWgpuColorMatrixInstance(
  runtime: WgpuRenderStateRuntime,
  adjustment: Readonly<ColorAdjustmentData> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  let out = runtime.spriteBatchColorMatrixData;
  if (out === undefined) {
    out = new Float32Array(COLOR_MATRIX_FLOATS * 256);
    runtime.spriteBatchColorMatrixData = out;
  } else if (offset + COLOR_MATRIX_FLOATS > out.length) {
    const grown = new Float32Array(Math.max(offset + COLOR_MATRIX_FLOATS, out.length * 2));
    grown.set(out);
    runtime.spriteBatchColorMatrixData = grown;
    out = grown;
  }
  if (adjustment === null) {
    writeIdentityColorMatrix(out, offset);
  } else if (isColorMatrixData(adjustment)) {
    for (let row = 0; row < 4; row++) {
      const source = row * 5;
      const target = offset + row * 4;
      out[target] = adjustment[source]!;
      out[target + 1] = adjustment[source + 1]!;
      out[target + 2] = adjustment[source + 2]!;
      out[target + 3] = adjustment[source + 3]!;
      out[offset + 16 + row] = adjustment[source + 4]!;
    }
  } else {
    writeIdentityColorMatrix(out, offset);
    for (let channel = 0; channel < 4; channel++) {
      out[offset + channel * 4 + channel] = getColorScale(adjustment, channel);
      out[offset + 16 + channel] = getColorBias(adjustment, channel);
    }
  }
}

function writeIdentityColorMatrix(out: Float32Array, offset: number): void {
  out.fill(0, offset, offset + COLOR_MATRIX_FLOATS);
  out[offset] = out[offset + 5] = out[offset + 10] = out[offset + 15] = 1;
}

function writeWgpuNativePackedTintAsColorMatrix(
  runtime: WgpuRenderStateRuntime,
  nativeWord: number,
  instanceIndex: number,
): void {
  writeWgpuColorMatrixInstance(runtime, null, instanceIndex);
  const out = runtime.spriteBatchColorMatrixData!;
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  out[offset] = (nativeWord & 0xff) / 255;
  out[offset + 5] = ((nativeWord >>> 8) & 0xff) / 255;
  out[offset + 10] = ((nativeWord >>> 16) & 0xff) / 255;
  out[offset + 15] = ((nativeWord >>> 24) & 0xff) / 255;
}

function writeWgpuAffineValuesAsColorMatrix(
  runtime: WgpuRenderStateRuntime,
  affine: Float32Array,
  affineOffset: number,
  instanceIndex: number,
): void {
  writeWgpuColorMatrixInstance(runtime, null, instanceIndex);
  const out = runtime.spriteBatchColorMatrixData!;
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  for (let channel = 0; channel < 4; channel++) {
    out[offset + channel * 4 + channel] = affine[affineOffset + channel]!;
    out[offset + 16 + channel] = affine[affineOffset + 4 + channel]!;
  }
}

function writeWgpuPackedTintInstance(runtime: WgpuRenderStateRuntime, rgba: number, instanceIndex: number): void {
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

function writeWgpuNativePackedTintAsColorScaleBias(
  runtime: WgpuRenderStateRuntime,
  nativeWord: number,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_SCALE_BIAS_FLOATS;
  writeWgpuColorScaleBiasInstance(runtime, null, instanceIndex);
  const data = runtime.spriteBatchColorScaleBiasData!;
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

const COLOR_SCALE_BIAS_WGSL = /* wgsl */ `
${WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
@group(3) @binding(0) var<storage, read> ctData : array<f32>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) ctMult : vec4f,
  @location(3) ctOff : vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  let b = ii * 8u;
  let ctMult = vec4f(ctData[b + 0u], ctData[b + 1u], ctData[b + 2u], ctData[b + 3u]);
  let ctOff = vec4f(ctData[b + 4u], ctData[b + 5u], ctData[b + 6u], ctData[b + 7u]);
  return VertexOut(bv.position, bv.uv, bv.alpha, ctMult, ctOff);
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.straightTextureAlpha != 0u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = applyFlightColorAdjustment(color, in.ctMult, in.ctOff);
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
`;

const PACKED_TINT_WGSL = /* wgsl */ `
${WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
@group(3) @binding(0) var<storage, read> tintData : array<u32>;

struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) tint : vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  return VertexOut(bv.position, bv.uv, bv.alpha, unpack4x8unorm(tintData[ii]));
}

@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.straightTextureAlpha != 0u) {
    color = vec4f(color.rgb * color.a, color.a);
  }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = applyFlightColorAdjustment(color, in.tint, vec4f(0.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
`;

const COLOR_MATRIX_WGSL = /* wgsl */ `
${WGPU_COLOR_MATRIX_FRAGMENT_CHUNK}
@group(3) @binding(0) var<storage, read> ctData : array<f32>;
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) row0 : vec4f,
  @location(3) row1 : vec4f,
  @location(4) row2 : vec4f,
  @location(5) row3 : vec4f,
  @location(6) offset : vec4f,
}
@vertex
fn vs_main(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VertexOut {
  let bv = quadBaseVertex(vi, ii);
  let b = ii * 20u;
  return VertexOut(
    bv.position, bv.uv, bv.alpha,
    vec4f(ctData[b], ctData[b + 1u], ctData[b + 2u], ctData[b + 3u]),
    vec4f(ctData[b + 4u], ctData[b + 5u], ctData[b + 6u], ctData[b + 7u]),
    vec4f(ctData[b + 8u], ctData[b + 9u], ctData[b + 10u], ctData[b + 11u]),
    vec4f(ctData[b + 12u], ctData[b + 13u], ctData[b + 14u], ctData[b + 15u]),
    vec4f(ctData[b + 16u], ctData[b + 17u], ctData[b + 18u], ctData[b + 19u]),
  );
}
@fragment
fn fs_main(in : VertexOut) -> @location(0) vec4f {
  var color = textureSample(tex, smp, in.uv);
  if (color.a <= 0.0) { discard; }
  if (uni.straightTextureAlpha != 0u) { color = vec4f(color.rgb * color.a, color.a); }
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = applyFlightColorMatrix(color, in.row0, in.row1, in.row2, in.row3, in.offset);
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
`;

const _colorScaleBiasModules = new WeakMap<GPUDevice, GPUShaderModule>();
const _packedTintModules = new WeakMap<GPUDevice, GPUShaderModule>();
const _colorMatrixModules = new WeakMap<GPUDevice, GPUShaderModule>();

const wgpuColorAdjustmentMaterialFeature: WgpuColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
  matrixFragmentShaderChunk: WGPU_COLOR_MATRIX_FRAGMENT_CHUNK,
  record: recordWgpuColorAdjustment,
  resolveFlush: resolveWgpuColorAdjustmentFlush,
};
