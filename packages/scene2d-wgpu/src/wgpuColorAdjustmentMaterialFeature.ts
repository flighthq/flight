import { createSlotTable } from '@flighthq/registry/contract';
import { getWgpuBlendState, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { enableColorAdjustments } from '@flighthq/render/contract';
import type {
  ColorScaleBias,
  RenderProxy2D,
  WgpuColorAdjustmentFlush,
  WgpuColorAdjustmentMaterialFeature,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuShapeMesh,
  WgpuShapeMeshBuffers,
  WgpuShapeMeshPipeline,
  TintMaterialData,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { getWgpuQuadBatchPreludeWGSL } from './wgpuQuadBatchWriter';
import { drawWgpuShapeMeshBatch } from './wgpuShapeMesh';

// Enables the opt-in color-adjustment accumulator and inline fold on a WebGPU render state: the fused-color-matrix
// scene2d the sprite/quad batch draws through so a color adjustment (and, later, other pointwise
// adjustments) folds into the batch as per-instance storage data at @group(3) — replicated across the
// batch for a whole-batch tint, or varied per instance — without ever splitting the batch. Until a
// state calls this, its render proxies stay unadjusted and the batch renderer carries none of this module's WGSL
// (both tree-shake out) and
// recordWgpuQuadBatchColorScaleBias silently skips every tint. Idempotent; safe to call per state.
export function registerWgpuColorAdjustmentMaterialFeature(state: WgpuRenderState): void {
  enableColorAdjustments(state);
  const runtime = getWgpuRenderStateRuntime(state);
  const table = runtime.registries.colorAdjustmentFeature ?? createSlotTable('WgpuColorAdjustmentFeature', 'Disabled');
  if (table.entry?.state !== RegistryEntryState.Bound || table.entry.value !== wgpuColorAdjustmentMaterialFeature) {
    runtime.registries.colorAdjustmentFeature = {
      ...table,
      entry: { state: RegistryEntryState.Bound, value: wgpuColorAdjustmentMaterialFeature },
    };
  }
  if (runtime.quadBatchWriterColorScaleBiasMode === undefined) runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_NONE;
}

// Per-instance color-adjustment data (8 floats = 4 scale + 4 bias). Wgpu carries every tint
// through the per-instance storage buffer, so a whole-batch (uniform) tint is the same value on each
// instance — there is no separate hardware-uniform path.
const COLOR_SCALE_BIAS_FLOATS = 8;
const COLOR_MATRIX_FLOATS = 20;

// Color-adjustment fold modes for the active quad-batch writer. NONE keeps the base module; UNIFORM defers
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
  const mode = runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE;
  const tint = colorScaleBias ?? null;

  if (mode === CT_MODE_MATRIX) {
    writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
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
      promoteWgpuQuadBatchWriterColorScaleBiasToMatrix(runtime, instanceIndex, null);
      writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (packedTint !== null) {
      promoteWgpuQuadBatchWriterColorScaleBiasToPackedTint(runtime, instanceIndex, null);
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuQuadBatchWriterColorScaleBiasToPerInstance(runtime, instanceIndex, null);
      writeWgpuColorScaleBiasInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_UNIFORM) {
    const uniform = runtime.quadBatchWriterUniformColorScaleBias ?? null;
    if (equalsRecordedColorScaleBias(tint, uniform)) return;
    if (isColorMatrixData(tint) || (uniform !== null && isColorMatrixData(uniform))) {
      promoteWgpuQuadBatchWriterColorScaleBiasToMatrix(runtime, instanceIndex, uniform);
      writeWgpuColorMatrixInstance(runtime, tint, instanceIndex);
      return;
    }
    const packedTint = getPackedTint(tint);
    if (getPackedTint(uniform) !== null && packedTint !== null) {
      promoteWgpuQuadBatchWriterColorScaleBiasToPackedTint(runtime, instanceIndex, uniform);
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuQuadBatchWriterColorScaleBiasToPerInstance(runtime, instanceIndex, uniform);
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
// batch carried no tint, so flushWgpuQuadBatchWriter runs the lean material path. Resets the fold mode for
// the next batch.
function resolveWgpuColorAdjustmentFlush(state: WgpuRenderState, count: number): WgpuColorAdjustmentFlush | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const ctMode = runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE;
  if (ctMode === CT_MODE_NONE) return null;
  if (ctMode === CT_MODE_UNIFORM) {
    const uniform = runtime.quadBatchWriterUniformColorScaleBias!;
    if (isColorMatrixData(uniform)) {
      runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_MATRIX;
      fillWgpuQuadBatchWriterUniformColorMatrix(runtime, uniform, count);
    } else {
      const packedTint = getPackedTint(uniform);
      if (packedTint !== null) {
        runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PACKED_TINT;
        fillWgpuQuadBatchWriterUniformPackedTint(runtime, packedTint, count);
      } else {
        runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PER_INSTANCE;
        fillWgpuQuadBatchWriterUniformColorScaleBias(runtime, uniform, count);
      }
    }
  }
  const resolvedMode = runtime.quadBatchWriterColorScaleBiasMode;
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_NONE;
  runtime.quadBatchWriterUniformColorScaleBias = null;
  if (resolvedMode === CT_MODE_PACKED_TINT) {
    return {
      data: runtime.quadBatchWriterColorTintData!,
      floats: 1,
      module: getWgpuQuadBatchWriterPackedTintModule(state),
    };
  }
  if (resolvedMode === CT_MODE_MATRIX) {
    return {
      data: runtime.quadBatchWriterColorMatrixData!,
      floats: COLOR_MATRIX_FLOATS,
      module: getWgpuQuadBatchWriterColorMatrixModule(state),
    };
  }
  return {
    data: runtime.quadBatchWriterColorScaleBiasData!,
    floats: COLOR_SCALE_BIAS_FLOATS,
    module: getWgpuQuadBatchWriterColorScaleBiasModule(state),
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
  const existing = runtime.quadBatchWriterColorScaleBiasData;
  if (existing !== undefined && floatsNeeded <= existing.length) return;
  const newSize = Math.max(floatsNeeded, (existing?.length ?? 0) * 2, COLOR_SCALE_BIAS_FLOATS * 256);
  const grown = new Float32Array(newSize);
  if (existing !== undefined) grown.set(existing);
  runtime.quadBatchWriterColorScaleBiasData = grown;
}

// Replicates a whole-batch uniform tint across `count` instances at flush time — Wgpu has no separate
// hardware-uniform tint path, so a uniform is the same value on every instance of the storage buffer.
function fillWgpuQuadBatchWriterUniformColorScaleBias(
  runtime: WgpuRenderStateRuntime,
  colorScaleBias: Readonly<ColorScaleBias | TintMaterialData>,
  count: number,
): void {
  ensureWgpuColorScaleBiasCapacity(runtime, count * COLOR_SCALE_BIAS_FLOATS);
  for (let i = 0; i < count; i++) writeWgpuColorScaleBiasInstance(runtime, colorScaleBias, i);
}

function fillWgpuQuadBatchWriterUniformPackedTint(runtime: WgpuRenderStateRuntime, rgba: number, count: number): void {
  for (let i = 0; i < count; i++) writeWgpuPackedTintInstance(runtime, rgba, i);
}

function fillWgpuQuadBatchWriterUniformColorMatrix(
  runtime: WgpuRenderStateRuntime,
  matrix: readonly number[],
  count: number,
): void {
  for (let i = 0; i < count; i++) writeWgpuColorMatrixInstance(runtime, matrix, i);
}

// The folded per-instance color-adjustment shader module (cached per device): the base quad-batch writer
// prelude plus a scene2d that reads 8 per-instance floats from the material storage buffer (@group(3))
// and applies `color * mult + offset` in unpremultiplied space. Reused verbatim from the former
// color-adjustment material so premultiplied-alpha handling is unchanged.
function getWgpuQuadBatchWriterColorScaleBiasModule(state: WgpuRenderState): GPUShaderModule {
  const runtime = getWgpuRenderStateRuntime(state);
  const cached = runtime.colorScaleBiasModule;
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + COLOR_SCALE_BIAS_WGSL,
  });
  runtime.colorScaleBiasModule = module;
  return module;
}

function getWgpuQuadBatchWriterPackedTintModule(state: WgpuRenderState): GPUShaderModule {
  const runtime = getWgpuRenderStateRuntime(state);
  const cached = runtime.packedTintModule;
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + PACKED_TINT_WGSL,
  });
  runtime.packedTintModule = module;
  return module;
}

function getWgpuQuadBatchWriterColorMatrixModule(state: WgpuRenderState): GPUShaderModule {
  const runtime = getWgpuRenderStateRuntime(state);
  const cached = runtime.colorMatrixModule;
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + COLOR_MATRIX_WGSL,
  });
  runtime.colorMatrixModule = module;
  return module;
}

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instanceCount) with `fill` (a prior uniform value, or null → identity).
function promoteWgpuQuadBatchWriterColorScaleBiasToPerInstance(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorScaleBias | TintMaterialData> | null,
): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PER_INSTANCE;
  for (let i = 0; i < instanceCount; i++) writeWgpuColorScaleBiasInstance(runtime, fill, i);
}

function promoteWgpuQuadBatchWriterColorScaleBiasToPackedTint(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorScaleBias | TintMaterialData> | null,
): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PACKED_TINT;
  for (let i = 0; i < instanceCount; i++) writeWgpuPackedTintInstance(runtime, getPackedTint(fill)!, i);
}

function promoteWgpuPackedTintToColorScaleBias(runtime: WgpuRenderStateRuntime, instanceCount: number): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_PER_INSTANCE;
  const packed = runtime.quadBatchWriterColorTintData!;
  for (let i = 0; i < instanceCount; i++) writeWgpuNativePackedTintAsColorScaleBias(runtime, packed[i], i);
}

function promoteWgpuQuadBatchWriterColorScaleBiasToMatrix(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorAdjustmentData> | null,
): void {
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeWgpuColorMatrixInstance(runtime, fill, i);
}

function promoteWgpuPackedTintToColorMatrix(runtime: WgpuRenderStateRuntime, instanceCount: number): void {
  const packed = runtime.quadBatchWriterColorTintData!;
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_MATRIX;
  for (let i = 0; i < instanceCount; i++) writeWgpuNativePackedTintAsColorMatrix(runtime, packed[i], i);
}

function promoteWgpuColorScaleBiasToMatrix(runtime: WgpuRenderStateRuntime, instanceCount: number): void {
  const affine = runtime.quadBatchWriterColorScaleBiasData!;
  runtime.quadBatchWriterColorScaleBiasMode = CT_MODE_MATRIX;
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
  const out = runtime.quadBatchWriterColorScaleBiasData!;
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
  let out = runtime.quadBatchWriterColorMatrixData;
  if (out === undefined) {
    out = new Float32Array(COLOR_MATRIX_FLOATS * 256);
    runtime.quadBatchWriterColorMatrixData = out;
  } else if (offset + COLOR_MATRIX_FLOATS > out.length) {
    const grown = new Float32Array(Math.max(offset + COLOR_MATRIX_FLOATS, out.length * 2));
    grown.set(out);
    runtime.quadBatchWriterColorMatrixData = grown;
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
  const out = runtime.quadBatchWriterColorMatrixData!;
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
  const out = runtime.quadBatchWriterColorMatrixData!;
  const offset = instanceIndex * COLOR_MATRIX_FLOATS;
  for (let channel = 0; channel < 4; channel++) {
    out[offset + channel * 4 + channel] = affine[affineOffset + channel]!;
    out[offset + 16 + channel] = affine[affineOffset + 4 + channel]!;
  }
}

function writeWgpuPackedTintInstance(runtime: WgpuRenderStateRuntime, rgba: number, instanceIndex: number): void {
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

function writeWgpuNativePackedTintAsColorScaleBias(
  runtime: WgpuRenderStateRuntime,
  nativeWord: number,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_SCALE_BIAS_FLOATS;
  writeWgpuColorScaleBiasInstance(runtime, null, instanceIndex);
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

// Draws tessellated solid fills through the same opt-in scale/bias fold as quad batches. A shape has
// one resolved node adjustment, so the value is uploaded once in each per-mesh uniform rather than as
// vertex data. The source color remains premultiplied by mesh alpha × node alpha in the shared driver;
// the fragment shader preserves the established unpremultiply → adjust → repremultiply order.
function drawWgpuShapeMeshesColorScaleBias(
  state: WgpuRenderState,
  renderProxy: RenderProxy2D,
  meshes: readonly WgpuShapeMesh[],
  buffers: WgpuShapeMeshBuffers,
): void {
  const colorScaleBias = renderProxy.colorScaleBias!;
  const uniform = _shapeMeshColorScaleBiasUniformScratch;
  uniform[16] = colorScaleBias.redScale;
  uniform[17] = colorScaleBias.greenScale;
  uniform[18] = colorScaleBias.blueScale;
  uniform[19] = colorScaleBias.alphaScale;
  uniform[20] = colorScaleBias.redBias;
  uniform[21] = colorScaleBias.greenBias;
  uniform[22] = colorScaleBias.blueBias;
  uniform[23] = colorScaleBias.alphaBias;
  drawWgpuShapeMeshBatch(
    state,
    renderProxy,
    meshes,
    buffers,
    ensureWgpuShapeMeshColorScaleBiasPipeline(state, renderProxy.blendMode),
    buffers.colorScaleBiasUniformBuffers,
    buffers.colorScaleBiasBindGroups,
    uniform,
  );
}

function ensureWgpuShapeMeshColorScaleBiasPipeline(
  state: WgpuRenderState,
  blendMode: RenderProxy2D['blendMode'],
): WgpuShapeMeshPipeline {
  const runtime = getWgpuRenderStateRuntime(state);
  let cache = runtime.shapeMeshColorScaleBiasPipelines;
  if (cache === undefined) {
    cache = new Map();
    runtime.shapeMeshColorScaleBiasPipelines = cache;
  }
  const format = runtime.currentColorFormat ?? state.format;
  const key = `${format}|${blendMode ?? 'null'}`;
  const existing = cache.get(key);
  if (existing !== undefined) return existing;

  const device = state.device;
  const module = device.createShaderModule({ code: SHAPE_MESH_COLOR_SCALE_BIAS_WGSL });
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }],
    },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [{ format, blend: getWgpuBlendState(blendMode) }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: { compare: 'equal', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
      stencilBack: { compare: 'equal', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
      stencilReadMask: 0xff,
      stencilWriteMask: 0x00,
    },
  });
  const created: WgpuShapeMeshPipeline = { pipeline, bindGroupLayout };
  cache.set(key, created);
  return created;
}

const SHAPE_MESH_COLOR_SCALE_BIAS_WGSL = /* wgsl */ `
${WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK}
struct ShapeMeshUniforms {
  matrix : mat3x3f,
  color : vec4f,
  colorScale : vec4f,
  colorBias : vec4f,
}
@group(0) @binding(0) var<uniform> u : ShapeMeshUniforms;
@vertex fn vs_main(@location(0) position : vec2f) -> @builtin(position) vec4f {
  let p = u.matrix * vec3f(position, 1.0);
  return vec4f(p.x, p.y, 0.0, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f {
  if (u.color.a <= 0.0) { discard; }
  var color = vec4f(u.color.rgb / u.color.a, u.color.a);
  color = applyFlightColorAdjustment(color, u.colorScale, u.colorBias);
  return vec4f(color.rgb * color.a, color.a);
}
`;

const _shapeMeshColorScaleBiasUniformScratch = new Float32Array(24);

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

const wgpuColorAdjustmentMaterialFeature: WgpuColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
  matrixFragmentShaderChunk: WGPU_COLOR_MATRIX_FRAGMENT_CHUNK,
  drawShapeMeshes: drawWgpuShapeMeshesColorScaleBias,
  record: recordWgpuColorAdjustment,
  resolveFlush: resolveWgpuColorAdjustmentFlush,
};
