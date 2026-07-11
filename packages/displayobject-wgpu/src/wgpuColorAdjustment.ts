import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  ColorTransform,
  WgpuColorAdjustmentFlush,
  WgpuColorAdjustmentFold,
  WgpuRenderState,
  WgpuRenderStateRuntime,
} from '@flighthq/types';

import { getWgpuQuadBatchPreludeWGSL } from './wgpuSpriteBatch';

// Enables the opt-in inline color-adjustment fold on a WebGPU render state: the fused-color-matrix
// stage the sprite/quad batch draws through so a color transform (and, later, other pointwise
// adjustments) folds into the batch as per-instance storage data at @group(3) — replicated across the
// batch for a whole-batch tint, or varied per instance — without ever splitting the batch. Until a
// state calls this, its batch renderer carries none of this module's WGSL (it tree-shakes out) and
// recordWgpuSpriteBatchColorTransform silently skips every tint. Idempotent; safe to call per state.
export function enableWgpuColorAdjustment(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.wgpuColorAdjustmentFold = wgpuColorAdjustmentFold;
  if (runtime.spriteBatchColorTransformMode === undefined) runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  if (runtime.spriteBatchColorTransformData === undefined) {
    runtime.spriteBatchColorTransformData = new Float32Array(COLOR_TRANSFORM_FLOATS * 256);
  }
}

// Per-instance color-transform data (8 floats = 4 multiplier + 4 offset). Wgpu carries every tint
// through the per-instance storage buffer, so a whole-batch (uniform) tint is the same value on each
// instance — there is no separate hardware-uniform path.
const COLOR_TRANSFORM_FLOATS = 8;

// Color-adjustment fold modes for the active sprite batch. NONE keeps the base module; UNIFORM defers
// per-instance fill while one tint covers the whole batch; PER_INSTANCE packs a tint per instance.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PER_INSTANCE = 2;

// Folds instance `instanceIndex`'s effective color transform into the active batch. See the fold-mode
// constants for the promotion rules. `colorTransform` is null for an untinted instance.
function recordWgpuColorAdjustment(
  runtime: WgpuRenderStateRuntime,
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
    promoteWgpuSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, null);
    writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
    return;
  }

  if (mode === CT_MODE_UNIFORM) {
    const uniform = runtime.spriteBatchUniformColorTransform ?? null;
    if (equalsRecordedColorTransform(tint, uniform)) return;
    promoteWgpuSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, uniform);
    writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
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
    fillWgpuSpriteBatchUniformColorTransform(runtime, runtime.spriteBatchUniformColorTransform!, count);
  }
  runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  runtime.spriteBatchUniformColorTransform = null;
  return {
    data: runtime.spriteBatchColorTransformData!,
    floats: COLOR_TRANSFORM_FLOATS,
    module: getWgpuSpriteBatchColorTransformModule(state),
  };
}

// Value equality for the whole-batch uniform check: reference-equal short-circuits (every glyph of a
// bitmap-text node shares one node-level tint), else compares all eight fields.
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
  colorTransform: Readonly<ColorTransform>,
  count: number,
): void {
  ensureWgpuColorTransformCapacity(runtime, count * COLOR_TRANSFORM_FLOATS);
  for (let i = 0; i < count; i++) writeWgpuColorTransformInstance(runtime, colorTransform, i);
}

// The folded per-instance color-transform shader module (cached per device): the base sprite-batch
// prelude plus a stage that reads 8 per-instance floats from the material storage buffer (@group(3))
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

// Switches the batch to per-instance mode and back-fills every already-recorded instance
// [0, instanceCount) with `fill` (a prior uniform value, or null → identity).
function promoteWgpuSpriteBatchColorTransformToPerInstance(
  runtime: WgpuRenderStateRuntime,
  instanceCount: number,
  fill: Readonly<ColorTransform> | null,
): void {
  runtime.spriteBatchColorTransformMode = CT_MODE_PER_INSTANCE;
  for (let i = 0; i < instanceCount; i++) writeWgpuColorTransformInstance(runtime, fill, i);
}

// Writes one instance's eight color-transform floats (multiplier rgba, then offset rgba normalized by
// 255) at its slot, growing the array as needed. A null transform writes the identity.
function writeWgpuColorTransformInstance(
  runtime: WgpuRenderStateRuntime,
  colorTransform: Readonly<ColorTransform> | null,
  instanceIndex: number,
): void {
  const offset = instanceIndex * COLOR_TRANSFORM_FLOATS;
  ensureWgpuColorTransformCapacity(runtime, offset + COLOR_TRANSFORM_FLOATS);
  const out = runtime.spriteBatchColorTransformData!;
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

const COLOR_TRANSFORM_WGSL = /* wgsl */ `
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
  color = color * clamp(in.alpha, 0.0, 1.0);
  if (color.a > 0.0) {
    color = vec4f(color.rgb / color.a, color.a);
    color = clamp(color * in.ctMult + in.ctOff, vec4f(0.0), vec4f(1.0));
    color = vec4f(color.rgb * color.a, color.a);
  }
  return color;
}
`;

const _colorTransformModules = new WeakMap<GPUDevice, GPUShaderModule>();

const wgpuColorAdjustmentFold: WgpuColorAdjustmentFold = {
  record: recordWgpuColorAdjustment,
  resolveFlush: resolveWgpuColorAdjustmentFlush,
};
