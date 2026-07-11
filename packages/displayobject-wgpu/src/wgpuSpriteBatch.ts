import { bindWgpuTexture } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  ColorTransform,
  Material,
  MaterialData,
  WgpuMaterialRenderer,
  WgpuRenderState,
  WgpuRenderStateRuntime,
  WgpuSpriteBatchBufferSlot,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

// Per-instance color-transform data (8 floats = 4 multiplier + 4 offset). Wgpu carries every tint
// through the material storage buffer, so a whole-batch (uniform) tint is the same value on each
// instance — there is no separate hardware-uniform path.
const COLOR_TRANSFORM_FLOATS = 8;

// Color-transform fold modes for the active sprite batch (see GlRenderStateRuntime / the record
// function for the promotion rules). NONE keeps the base module; UNIFORM defers per-instance fill
// while one tint covers the whole batch; PER_INSTANCE packs a tint per instance.
const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PER_INSTANCE = 2;

// Base per-instance layout (13 floats = 52 bytes). This is a fixed contract material shaders read
// from the instance storage buffer; it carries no material concern (no color transform). A material
// that needs per-instance data writes it into a parallel material storage buffer instead.
// [0-3]   a, b, c, d   — world-space 2D matrix
// [4-5]   tx, ty       — world-space translation
// [6-7]   width, height — region size in pixels
// [8-11]  u0,v0,u1,v1  — atlas UV rect
// [12]    alpha        — per-instance alpha
export const SPRITE_INSTANCE_FLOATS = 13;
const SPRITE_INSTANCE_STRIDE = SPRITE_INSTANCE_FLOATS * 4;

// Shared WGSL prelude for sprite-batch material shaders: the base Uniforms and InstanceData structs,
// the standard bind-group bindings (@group(0) uniform, @group(1) texture/sampler, @group(2)
// instances), and a quadBaseVertex helper that expands one instance corner into clip-space position,
// UV, and alpha. A material module appends its own @group(3) material buffer (when it uses one), a
// VertexOut struct, vs_main, and fs_main. The base path knows nothing about what a material does
// with this — color transform and any other effect live entirely in the material's own module.
const QUAD_BATCH_PRELUDE_WGSL = /* wgsl */ `
struct Uniforms {
  matrix : mat3x3f,
}

struct InstanceData {
  a : f32, b : f32, c : f32, d : f32,
  tx : f32, ty : f32,
  width : f32, height : f32,
  u0 : f32, v0 : f32, u1 : f32, v1 : f32,
  alpha : f32,
}

@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@group(2) @binding(0) var<storage, read> instances : array<InstanceData>;

struct BaseVertex {
  position : vec4f,
  uv : vec2f,
  alpha : f32,
}

fn quadBaseVertex(vi : u32, ii : u32) -> BaseVertex {
  let inst = instances[ii];
  let xi = (vi == 1u || vi == 2u || vi == 4u);
  let yi = (vi == 2u || vi == 4u || vi == 5u);
  let lx = select(0.0, inst.width, xi);
  let ly = select(0.0, inst.height, yi);
  let wx = inst.a * lx + inst.c * ly + inst.tx;
  let wy = inst.b * lx + inst.d * ly + inst.ty;
  let p = uni.matrix * vec3f(wx, wy, 1.0);
  var bv : BaseVertex;
  bv.position = vec4f(p.x, p.y, 0.0, 1.0);
  bv.uv = vec2f(select(inst.u0, inst.u1, xi), select(inst.v0, inst.v1, yi));
  bv.alpha = inst.alpha;
  return bv;
}
`;

export function ensureWgpuQuadBatchResources(state: WgpuRenderState): WgpuQuadBatchResources {
  const runtime = getWgpuRenderStateRuntime(state);
  const existing = _quadBatchResources.get(state.device);
  if (existing !== undefined) return existing;

  const { device } = state;
  const { uniformBindGroupLayout, textureBindGroupLayout } = runtime;

  const instanceBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
  });

  // Generic per-instance material buffer (array<f32>); the same layout serves every material that
  // appends per-instance data, so the batch — not the material — owns it.
  const materialBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
  });

  const basePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout, textureBindGroupLayout, instanceBindGroupLayout],
  });

  const materialPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [
      uniformBindGroupLayout,
      textureBindGroupLayout,
      instanceBindGroupLayout,
      materialBindGroupLayout,
    ],
  });

  const resources: WgpuQuadBatchResources = {
    instanceBindGroupLayout,
    materialBindGroupLayout,
    basePipelineLayout,
    materialPipelineLayout,
    pipelines: new WeakMap(),
  };
  _quadBatchResources.set(device, resources);
  return resources;
}

export interface WgpuQuadBatchResources {
  instanceBindGroupLayout: GPUBindGroupLayout;
  materialBindGroupLayout: GPUBindGroupLayout;
  basePipelineLayout: GPUPipelineLayout;
  materialPipelineLayout: GPUPipelineLayout;
  // Pipelines keyed first by the material's shader module, then by blend+stencil state.
  pipelines: WeakMap<GPUShaderModule, Map<string, GPURenderPipeline>>;
}

const _quadBatchResources = new WeakMap<GPUDevice, WgpuQuadBatchResources>();

const NORMAL_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

const ADD_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};

export function flushWgpuSpriteBatch(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const count = runtime.spriteBatchCount;
  if (count === 0 || runtime.renderPass === null) {
    resetWgpuSpriteBatch(state);
    return;
  }

  const texture = runtime.spriteBatchTexture!;
  const blendMode = runtime.spriteBatchBlendMode;
  const renderer = runtime.spriteBatchMaterialRenderer!;
  const ctMode = runtime.spriteBatchColorTransformMode;
  const uniformColorTransform = runtime.spriteBatchUniformColorTransform;
  // A color-transform batch folds its tint through the material storage buffer (@group(3)); an
  // untinted batch falls back to the resolved material's own per-instance data. The two never mix in
  // a built-in batch (built-in materials have no per-instance floats).
  const hasColorTransform = ctMode !== CT_MODE_NONE;
  if (hasColorTransform && ctMode === CT_MODE_UNIFORM) {
    fillWgpuSpriteBatchUniformColorTransform(runtime, uniformColorTransform!, count);
  }
  const group3Floats = hasColorTransform ? COLOR_TRANSFORM_FLOATS : runtime.spriteBatchMaterialFloats;
  const group3Data = hasColorTransform ? runtime.spriteBatchColorTransformData : runtime.spriteBatchMaterialData;
  resetWgpuSpriteBatch(state);

  const resources = ensureWgpuQuadBatchResources(state);

  // Claim a distinct pool slot for this flush. The canvas pass is submitted once at end of frame, so
  // a buffer shared across flushes would be rewritten before any draw reads it, leaving every draw
  // reading the last flush's data. A per-flush slot keeps each draw's instances intact until submit.
  const slot = acquireWgpuSpriteBatchBufferSlot(state);

  const instanceBytes = count * SPRITE_INSTANCE_STRIDE;
  if (slot.instanceBuffer === null || slot.instanceCapacity < instanceBytes) {
    const capacity = Math.max(instanceBytes, slot.instanceCapacity * 2, SPRITE_INSTANCE_STRIDE * 256);
    slot.instanceBuffer = createWgpuSpriteBatchBuffer(state, capacity);
    slot.instanceCapacity = capacity;
  }
  state.device.queue.writeBuffer(slot.instanceBuffer, 0, runtime.spriteBatchInstanceData.buffer, 0, instanceBytes);

  if (group3Floats > 0) {
    const group3Bytes = count * group3Floats * 4;
    if (slot.materialBuffer === null || slot.materialCapacity < group3Bytes) {
      const capacity = Math.max(group3Bytes, slot.materialCapacity * 2, group3Floats * 4 * 256);
      slot.materialBuffer = createWgpuSpriteBatchBuffer(state, capacity);
      slot.materialCapacity = capacity;
    }
    state.device.queue.writeBuffer(slot.materialBuffer, 0, group3Data.buffer, 0, group3Bytes);
  }

  state.applyBlendMode?.(state, blendMode);
  const textureEntry = bindWgpuTexture(state, texture);

  const uniformOffset = writeWgpuSpriteBatchUniforms(state);

  const instanceBindGroup = state.device.createBindGroup({
    layout: resources.instanceBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: slot.instanceBuffer } }],
  });

  const module = hasColorTransform ? getWgpuSpriteBatchColorTransformModule(state) : renderer.getShaderModule(state);
  const pipeline = getWgpuQuadBatchPipeline(state, resources, module, group3Floats > 0, blendMode);
  const pass = runtime.renderPass!;
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, runtime.uniformBindGroup, [uniformOffset]);
  pass.setBindGroup(1, textureEntry.bindGroup);
  pass.setBindGroup(2, instanceBindGroup);
  if (group3Floats > 0) {
    const materialBindGroup = state.device.createBindGroup({
      layout: resources.materialBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: slot.materialBuffer! } }],
    });
    pass.setBindGroup(3, materialBindGroup);
  }
  if (runtime.currentMaskDepth > 0) pass.setStencilReference(runtime.currentMaskDepth);
  pass.draw(6, count, 0, 0);
}

export function getWgpuQuadBatchPipeline(
  state: WgpuRenderState,
  resources: WgpuQuadBatchResources,
  module: GPUShaderModule,
  hasMaterialData: boolean,
  blendMode: BlendMode | null,
): GPURenderPipeline {
  const runtime = getWgpuRenderStateRuntime(state);
  let perModule = resources.pipelines.get(module);
  if (perModule === undefined) {
    perModule = new Map();
    resources.pipelines.set(module, perModule);
  }
  const stencilMode = runtime.maskWriteMode ? 'maskwrite' : runtime.currentMaskDepth > 0 ? 'masked' : 'normal';
  // The pipeline bakes its color-attachment format, so key on the current target format too (rgba16float
  // inside an HDR effect target vs the canvas format).
  const format = runtime.currentColorFormat ?? state.format;
  const key = `${blendMode ?? 'null'}-${stencilMode}-${format}`;
  const cached = perModule.get(key);
  if (cached !== undefined) return cached;

  const { device } = state;
  const blend = blendMode === BlendMode.Add ? ADD_BLEND : NORMAL_BLEND;
  const isMaskWrite = stencilMode === 'maskwrite';

  let stencilFace: GPUStencilFaceState;
  if (isMaskWrite) {
    stencilFace = { compare: 'always', passOp: 'replace', failOp: 'keep', depthFailOp: 'keep' };
  } else if (stencilMode === 'masked') {
    stencilFace = { compare: 'equal', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' };
  } else {
    stencilFace = { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' };
  }

  const pipeline = device.createRenderPipeline({
    layout: hasMaterialData ? resources.materialPipelineLayout : resources.basePipelineLayout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [{ format, blend: isMaskWrite ? undefined : blend, writeMask: isMaskWrite ? 0 : GPUColorWrite.ALL }],
    },
    depthStencil: {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: stencilFace,
      stencilBack: stencilFace,
      stencilReadMask: 0xff,
      stencilWriteMask: isMaskWrite ? 0xff : 0x00,
    },
    primitive: { topology: 'triangle-list' },
  });

  perModule.set(key, pipeline);
  return pipeline;
}

// Returns the shared WGSL prelude a material shader prepends before its own VertexOut/vs_main/fs_main
// (and optional @group(3) material buffer). Exposed so a user-authored material can build on the same
// base instance contract the bundled materials use.
export function getWgpuQuadBatchPreludeWGSL(): string {
  return QUAD_BATCH_PRELUDE_WGSL;
}

// Writes one instance's per-instance material floats into the parallel material buffer at the
// instance's slot. No-op for materials with no per-instance data (floats === 0 / no packInstance),
// so the base path never assumes any particular material contributes here.
export function packWgpuSpriteBatchMaterialInstance(
  state: WgpuRenderState,
  materialData: MaterialData | null,
  instanceIndex: number,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const floats = runtime.spriteBatchMaterialFloats;
  if (floats === 0) return;
  const renderer = runtime.spriteBatchMaterialRenderer;
  if (renderer === null || renderer.packInstance === undefined) return;
  renderer.packInstance(
    state,
    runtime.spriteBatchMaterial,
    materialData,
    runtime.spriteBatchMaterialData,
    instanceIndex * floats,
  );
}

// Ensures the sprite batch can accept up to `maxInstances` more instances for the given texture,
// blend mode, and material. Flushes when any of the three changes (material by reference) or
// capacity is exceeded. Returns the float index in spriteBatchInstanceData where the caller writes
// base instance data; the caller increments the runtime's spriteBatchCount and calls
// packWgpuSpriteBatchMaterialInstance per instance.
export function prepareWgpuSpriteBatchWrite(
  state: WgpuRenderState,
  texture: CanvasImageSource,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: WgpuMaterialRenderer,
  maxInstances: number,
): number {
  const runtime = getWgpuRenderStateRuntime(state);
  if (
    texture !== runtime.spriteBatchTexture ||
    blendMode !== runtime.spriteBatchBlendMode ||
    material !== runtime.spriteBatchMaterial
  ) {
    flushWgpuSpriteBatch(state);
  }
  runtime.spriteBatchTexture = texture;
  runtime.spriteBatchBlendMode = blendMode;
  runtime.spriteBatchMaterial = material;
  runtime.spriteBatchMaterialRenderer = materialRenderer;
  const floats = materialRenderer.instanceFloatCount;
  runtime.spriteBatchMaterialFloats = floats;

  const needed = (runtime.spriteBatchCount + maxInstances) * SPRITE_INSTANCE_FLOATS;
  if (needed > runtime.spriteBatchInstanceData.length) {
    const newSize = Math.max(needed, runtime.spriteBatchInstanceData.length * 2, SPRITE_INSTANCE_FLOATS * 256);
    runtime.spriteBatchInstanceData = new Float32Array(newSize);
  }

  if (floats > 0) {
    const materialNeeded = (runtime.spriteBatchCount + maxInstances) * floats;
    if (materialNeeded > runtime.spriteBatchMaterialData.length) {
      const newSize = Math.max(materialNeeded, runtime.spriteBatchMaterialData.length * 2, floats * 256);
      runtime.spriteBatchMaterialData = new Float32Array(newSize);
    }
  }

  return runtime.spriteBatchCount * SPRITE_INSTANCE_FLOATS;
}

// Records instance `instanceIndex`'s effective color transform into the active batch, folding it into
// the draw without ever splitting the batch. A batch starts untinted (mode NONE); the first tint on
// instance 0 makes it a whole-batch UNIFORM; a diverging tint (or an untinted instance following a
// tinted one) promotes it to PER_INSTANCE, back-filling already-recorded instances with the prior
// uniform value (or identity). Wgpu realizes both uniform and per-instance through the material
// storage buffer — a uniform is replicated per instance at flush. `colorTransform` is null/undefined
// for an untinted instance.
export function recordWgpuSpriteBatchColorTransform(
  state: WgpuRenderState,
  colorTransform: ColorTransform | null | undefined,
  instanceIndex: number,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const mode = runtime.spriteBatchColorTransformMode;
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
    const uniform = runtime.spriteBatchUniformColorTransform;
    if (equalsRecordedColorTransform(tint, uniform)) return;
    promoteWgpuSpriteBatchColorTransformToPerInstance(runtime, instanceIndex, uniform);
    writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
    return;
  }

  writeWgpuColorTransformInstance(runtime, tint, instanceIndex);
}

// Resets the per-frame buffer-pool cursor so the next frame reclaims slots from the start. Must be
// called once at the start of each frame's batch work — the screen frame via renderWgpuBackground,
// and the offscreen cache bake via refreshWgpuRenderCache (the bake flushes on its own state).
export function resetWgpuSpriteBatchBufferPool(state: WgpuRenderState): void {
  getWgpuRenderStateRuntime(state).spriteBatchBufferCursor = 0;
}

// Claims the next per-frame pool slot, allocating one if the frame has more flushes than any prior
// frame. The cursor is reset to 0 each frame by resetWgpuSpriteBatchBufferPool.
function acquireWgpuSpriteBatchBufferSlot(state: WgpuRenderState): WgpuSpriteBatchBufferSlot {
  const runtime = getWgpuRenderStateRuntime(state);
  const pool = runtime.spriteBatchBufferPool;
  let slot = pool[runtime.spriteBatchBufferCursor];
  if (slot === undefined) {
    slot = { instanceBuffer: null, instanceCapacity: 0, materialBuffer: null, materialCapacity: 0 };
    pool[runtime.spriteBatchBufferCursor] = slot;
  }
  runtime.spriteBatchBufferCursor++;
  return slot;
}

function createWgpuSpriteBatchBuffer(state: WgpuRenderState, size: number): GPUBuffer {
  return state.device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
}

function resetWgpuSpriteBatch(state: WgpuRenderState): void {
  const runtime = getWgpuRenderStateRuntime(state);
  runtime.spriteBatchCount = 0;
  runtime.spriteBatchTexture = null;
  runtime.spriteBatchBlendMode = null;
  runtime.spriteBatchMaterial = null;
  runtime.spriteBatchMaterialRenderer = null;
  runtime.spriteBatchMaterialFloats = 0;
  runtime.spriteBatchColorTransformMode = CT_MODE_NONE;
  runtime.spriteBatchUniformColorTransform = null;
}

// Writes the NDC viewport matrix into the uniform ring (the only uniform the batch shader reads) and
// advances the ring offset. Returns the byte offset for the dynamic bind-group binding.
function writeWgpuSpriteBatchUniforms(state: WgpuRenderState): number {
  const runtime = getWgpuRenderStateRuntime(state);
  const uniformOffset = runtime.uniformOffset;
  const floatBase = uniformOffset >> 2;
  const { uniformData } = runtime;
  const viewport = runtime.renderTargetViewport ?? state.canvas;
  const iw = 2 / viewport.width;
  const ih = 2 / viewport.height;

  uniformData[floatBase + 0] = iw;
  uniformData[floatBase + 1] = 0;
  uniformData[floatBase + 2] = 0;
  uniformData[floatBase + 3] = 0;
  uniformData[floatBase + 4] = 0;
  uniformData[floatBase + 5] = -ih;
  uniformData[floatBase + 6] = 0;
  uniformData[floatBase + 7] = 0;
  uniformData[floatBase + 8] = -1;
  uniformData[floatBase + 9] = 1;
  uniformData[floatBase + 10] = 1;
  uniformData[floatBase + 11] = 0;
  runtime.uniformOffset += runtime.uniformStride;
  return uniformOffset;
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
  if (floatsNeeded <= runtime.spriteBatchColorTransformData.length) return;
  const newSize = Math.max(floatsNeeded, runtime.spriteBatchColorTransformData.length * 2);
  const grown = new Float32Array(newSize);
  grown.set(runtime.spriteBatchColorTransformData);
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
