import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  ColorTransform,
  WgpuColorAdjustmentFlush,
  WgpuColorAdjustmentMaterialFeature,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  TintMaterialData,
} from '@flighthq/types';

import { getWgpuQuadBatchPreludeWGSL } from './wgpuSpriteBatch';

// Enables the opt-in inline color-adjustment fold on a WebGPU render state: the fused-color-matrix
// scene2d the sprite/quad batch draws through so a color transform (and, later, other pointwise
// adjustments) folds into the batch as per-instance storage data at @group(3) — replicated across the
// batch for a whole-batch tint, or varied per instance — without ever splitting the batch. Until a
// state calls this, its batch renderer carries none of this module's WGSL (it tree-shakes out) and
// recordWgpuSpriteBatchColorTransform silently skips every tint. Idempotent; safe to call per state.
export function registerWgpuColorAdjustmentMaterialFeature(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.wgpuColorAdjustmentMaterialFeature = wgpuColorAdjustmentMaterialFeature;
  if (runtime.spriteBatchColorTransformMode === undefined) runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
}

// Per-instance color-transform data (8 floats = 4 multiplier + 4 offset). Wgpu carries every tint
// through the per-instance storage buffer, so a whole-batch (uniform) tint is the same value on each
// instance — there is no separate hardware-uniform path.
const COLOR_TRANSFORM_FLOATS = 8;

// Color-adjustment fold modes for the active sprite batch. NONE keeps the base module; UNIFORM defers
// per-instance fill while one tint covers the whole batch; PER_INSTANCE packs a tint per instance.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PACKED_TINT = 2;
const CT_MODE_PER_INSTANCE = 3;

// The backend's single color-adjustment shader chunk. The registered feature carries it to Standard
// 2D and promoted 3D family variants without making their lean compilers statically own the code.
const WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK = /* wgsl */ `
fn applyFlightColorAdjustment(color : vec4f, multiplier : vec4f, offset : vec4f) -> vec4f {
  return clamp(color * multiplier + offset, vec4f(0.0), vec4f(1.0));
}
`;

// Folds instance `instanceIndex`'s effective color transform into the active batch. See the fold-mode
// constants for the promotion rules. `colorTransform` is null for an untinted instance.
function recordWgpuColorAdjustment(
  runtime: WgpuRenderStateRuntime,
  colorTransform: ColorTransform | TintMaterialData | null | undefined,
  instanceIndex: number,
): void {
  const mode = runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE;
  const tint = colorTransform ?? null;

  if (mode === CT_MODE_NONE) {
    if (tint === null) return;
    if (instanceIndex === 0) {
      runtime.spriteBatchColorTransformMode = CT_MODE_UNIFORM;
      runtime.spriteBatchUniformColorTransform = tint;
      return;
    }
    const packedTint = getPackedTint(tint);
    if (packedTint !== null) {
      promoteWgpuSpriteBatchColorTransformToPackedTint(runtime, instanceIndex, null);
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, null);
      writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_UNIFORM) {
    const uniform = runtime.spriteBatchUniformColorTransform ?? null;
    if (equalsRecordedColorTransform(tint, uniform)) return;
    const packedTint = getPackedTint(tint);
    if (getPackedTint(uniform) !== null && packedTint !== null) {
      promoteWgpuSpriteBatchColorTransformToPackedTint(runtime, instanceIndex, uniform);
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, uniform);
      writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  if (mode === CT_MODE_PACKED_TINT) {
    const packedTint = getPackedTint(tint);
    if (packedTint !== null) {
      writeWgpuPackedTintInstance(runtime, packedTint, instanceIndex);
    } else {
      promoteWgpuPackedTintToColorTransform(runtime, instanceIndex);
      writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
    }
    return;
  }

  writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
}

// Resolves the active batch's folded realization: replicates a whole-batch uniform tint across the
// batch, then returns the per-instance storage data + the folded shader module. Returns null when the
// batch carried no tint, so flushWgpuSpriteBatch runs the lean material path. Resets the fold mode for
// the next batch.
function resolveWgpuColorAdjustmentFlush(state: WgpuRenderState, count: number): WgpuColorAdjustmentFlush | null {
  const runtime = getWgpuRenderStateRuntime(state);
  const ctMode = runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE;
  if (ctMode === CT_MODE_NONE) return null;
  if (ctMode === CT_MODE_UNIFORM) {
    const uniform = runtime.spriteBatchUniformColorTransform!;
    const packedTint = getPackedTint(uniform);
    if (packedTint !== null) {
      runtime.spriteBatchColorTransformMode = CT_MODE_PACKED_TINT;
      fillWgpuSpriteBatchUniformPackedTint(runtime, packedTint, count);
    } else {
      runtime.spriteBatchColorTransformMode = CT_MODE_PER_INSTANCE;
      fillWgpuSpriteBatchUniformColorTransform(runtime, uniform, count);
    }
  }
  const resolvedMode = runtime.spriteBatchColorTransformMode;
  runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  runtime.spriteBatchUniformColorTransform = null;
  if (resolvedMode === CT_MODE_PACKED_TINT) {
    return {
      data: runtime.spriteBatchColorTintData!,
      floats: 1,
      module: getWgpuSpriteBatchPackedTintModule(state),
    };
  }
  return {
    data: runtime.spriteBatchColorTransformData!,
    floats: COLOR_TRANSFORM_FLOATS,
    module: getWgpuSpriteBatchColorTransformModule(state),
  };
}

// Value equality for the whole-batch uniform check: reference-equal short-circuits (every glyph of a
// bitmap-text node shares one node-level tint), else compares all eight fields.
function equalsRecordedColorTransform(
  a: Readonly<ColorTransform | TintMaterialData> | null,
  b: Readonly<ColorTransform | TintMaterialData> | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
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

// Grows the color-transform data array to hold `floatsNeeded` floats, preserving already-recorded
// per-instance data.
function ensureWgpuColorTransformCapacity(runtime: WgpuRenderStateRuntime, floatsNeeded: number): void {
  const existing = runtime.spriteBatchColorTransformData;
  if (existing !== undefined && floatsNeeded <= existing.length) return;
  const newSize = Math.max(floatsNeeded, (existing?.length ?? 0) * 2, COLOR_TRANSFORM_FLOATS * 256);
  const grown = new Float32Array(newSize);
  if (existing !== undefined) grown.set(existing);
  runtime.spriteBatchColorTransformData = grown;
}

// Replicates a whole-batch uniform tint across `count` instances at flush time — Wgpu has no separate
// hardware-uniform tint path, so a uniform is the same value on every instance of the storage buffer.
function fillWgpuSpriteBatchUniformColorTransform(
  runtime: WgpuRenderStateRuntime,
  colorTransform: Readonly<ColorTransform | TintMaterialData>,
  count: number,
): void {
  ensureWgpuColorTransformCapacity(runtime, count * COLOR_TRANSFORM_FLOATS);
  for (let i = 0; i < count; i++) writeWgpuColorTransformInstance(runtime, colorTransform, i);
}

function fillWgpuSpriteBatchUniformPackedTint(runtime: WgpuRenderStateRuntime, rgba: number, count: number): void {
  for (let i = 0; i < count; i++) writeWgpuPackedTintInstance(runtime, rgba, i);
}

// The folded per-instance color-transform shader module (cached per device): the base sprite-batch
// prelude plus a scene2d that reads 8 per-instance floats from the material storage buffer (@group(3))
// and applies `color * mult + offset` in unpremultiplied space. Reused verbatim from the former
// color-transform material so premultiplied-alpha handling is unchanged.
function getWgpuSpriteBatchColorTransformModule(state: WgpuRenderState): GPUShaderModule {
  const cached = _colorTransformModules.get(state.device);
  if (cached !== undefined) return cached;
  const module = state.device.createShaderModule({
    code: getWgpuQuadBatchPreludeWGSL() + COLOR_TRANSFORM_WGSL,
  });
  _colorTransformModules.set(state.device, module);
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

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instanceCount) with `fill` (a prior uniform value, or null → identity).
function promoteWgpuSpriteBatchColorTransformToPerInstance(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorTransform | TintMaterialData> | null,
): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PER_INSTANCE;
  for (let i = 0; i < instanceCount; i++) writeWgpuColorTransformInstance(runtime, fill, i);
}

function promoteWgpuSpriteBatchColorTransformToPackedTint(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorTransform | TintMaterialData> | null,
): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PACKED_TINT;
  for (let i = 0; i < instanceCount; i++) writeWgpuPackedTintInstance(runtime, getPackedTint(fill)!, i);
}

function promoteWgpuPackedTintToColorTransform(runtime: WgpuRenderStateRuntime, instanceCount: number): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PER_INSTANCE;
  const packed = runtime.spriteBatchColorTintData!;
  for (let i = 0; i < instanceCount; i++) writeWgpuNativePackedTintAsColorTransform(runtime, packed[i], i);
}

// Writes one instance's eight color-transform floats (multiplier rgba, then offset rgba normalized by
// 255) at its slot, growing the array as needed. A null transform writes the identity.
function writeWgpuColorTransformInstance(
  runtime: WgpuRenderStateRuntime,
  colorTransform: Readonly<ColorTransform | TintMaterialData> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_TRANSFORM_FLOATS;
  ensureWgpuColorTransformCapacity(runtime, offset + COLOR_TRANSFORM_FLOATS);
  const out = runtime.spriteBatchColorTransformData!;
  if (colorTransform !== null) {
    for (let channel = 0; channel < 4; channel++) {
      out[offset + channel] = getColorMultiplier(colorTransform, channel);
      out[offset + 4 + channel] = getColorOffset(colorTransform, channel);
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

function writeWgpuNativePackedTintAsColorTransform(
  runtime: WgpuRenderStateRuntime,
  nativeWord: number,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_TRANSFORM_FLOATS;
  writeWgpuColorTransformInstance(runtime, null, instanceIndex);
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

const COLOR_TRANSFORM_WGSL = /* wgsl */ `
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

const _colorTransformModules = new WeakMap<GPUDevice, GPUShaderModule>();
const _packedTintModules = new WeakMap<GPUDevice, GPUShaderModule>();

const wgpuColorAdjustmentMaterialFeature: WgpuColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: WGPU_COLOR_ADJUSTMENT_FRAGMENT_CHUNK,
  record: recordWgpuColorAdjustment,
  resolveFlush: resolveWgpuColorAdjustmentFlush,
};
