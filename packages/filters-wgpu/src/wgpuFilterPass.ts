import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { ALL_WGPU_FILTER_PIPELINE_CACHES } from './wgpuFilterPipelineCache';

// Shared vertex shader: full-screen quad via vertex_index, no vertex buffer needed.
// UV convention: y=0 = texture top, y=1 = texture bottom (Wgpu top-left origin).
// NDC y=+1 (top) → uv.y=0, NDC y=-1 (bottom) → uv.y=1.
export const FILTER_VERTEX_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOut {
  let xi = vi == 1u || vi == 2u || vi == 4u;
  let yi = vi == 2u || vi == 4u || vi == 5u;
  var out : VertexOut;
  out.position = vec4f(select(-1.0, 1.0, xi), select(-1.0, 1.0, yi), 0.0, 1.0);
  out.uv = vec2f(select(0.0, 1.0, xi), select(1.0, 0.0, yi));
  return out;
}
`;

// Premultiplied-alpha compositing blend state, matching Gl's ONE + ONE_MINUS_SRC_ALPHA.
const PREMUL_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

// Opaque / replace blend: writes the filter result directly without compositing.
const REPLACE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
};

export type WgpuFilterPipeline = {
  // The default variant, compiled for the canvas format (state.format).
  pipeline: GPURenderPipeline;
  blendMode: 'premul' | 'replace';
  // Compiles a variant of this pipeline targeting `format`. A render pipeline's color target format must
  // match the attachment it draws into, so drawing a filter into a non-canvas-format target (an HDR
  // rgba16float effect target) needs a matching variant; the draw path resolves and caches it per format.
  // Optional so externally-constructed WgpuFilterPipeline values (e.g. the gradient filters) still type.
  compileForFormat?: (format: GPUTextureFormat) => GPURenderPipeline;
  variants?: Map<GPUTextureFormat, GPURenderPipeline>;
};

export type WgpuDualSourcePipeline = WgpuFilterPipeline;

// Per-render-state filter infrastructure: ring buffer for uniforms, shared layouts,
// and texture bind-group cache keyed by GPUTextureView.
type WgpuFilterState = {
  uniformBuffer: GPUBuffer;
  uniformData: Float32Array;
  uniformDataI32: Int32Array;
  uniformOffset: number;
  uniformStride: number;
  uniformSlots: number;
  uniformBGLayout: GPUBindGroupLayout;
  uniformBG: GPUBindGroup;
  textureBGLayout: GPUBindGroupLayout;
  textureBGs: WeakMap<GPUTextureView, GPUBindGroup>;
  sampler: GPUSampler;
  format: GPUTextureFormat;
};

const filterStates = new WeakMap<WgpuRenderState, WgpuFilterState>();

// Registry of all per-filter pipeline caches. Each filter module registers its module-level
// WeakMap here via registerWgpuFilterPipelineCache so destroyWgpuFilterPipelines can evict stale
// pipeline entries on device loss / state teardown. Without eviction, a filter that cached a
// pipeline before destroy would continue drawing with a pipeline referencing the old (lost) device.
const pipelineCacheRegistry: WeakMap<WgpuRenderState, unknown>[] = [];

function getOrCreateFilterState(state: WgpuRenderState): WgpuFilterState {
  let fs = filterStates.get(state);
  if (fs !== undefined) return fs;

  const { device, format } = state;

  // 512 slots × 256 bytes = 128 KB ring buffer for filter uniforms.
  // 256 bytes/slot is enough for the largest filter (convolution: ~244 bytes).
  // Using separate slots per draw avoids writeBuffer ordering issues when
  // multiple filters of the same type run within a single command encoder.
  // Wrapping back to slot 0 within a frame is safe in practice: 512 filter
  // draws per frame would require more than 512 active filter applications.
  const SLOTS = 512;
  const STRIDE = 256;

  const uniformBuffer = device.createBuffer({
    size: SLOTS * STRIDE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformData = new Float32Array((SLOTS * STRIDE) / 4);
  const uniformDataI32 = new Int32Array(uniformData.buffer);

  const uniformBGLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        // minBindingSize omitted (0): the bound range size (uniformStride) is validated at
        // draw time instead of statically, so filters with structs larger than any fixed
        // minimum (color matrix 80B, convolution 244B) share this one layout.
        buffer: { type: 'uniform', hasDynamicOffset: true },
      },
    ],
  });

  const uniformBG = device.createBindGroup({
    layout: uniformBGLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer, size: STRIDE } }],
  });

  const textureBGLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  fs = {
    uniformBuffer,
    uniformData,
    uniformDataI32,
    uniformOffset: 0,
    uniformStride: STRIDE,
    uniformSlots: SLOTS,
    uniformBGLayout,
    uniformBG,
    textureBGLayout,
    textureBGs: new WeakMap(),
    sampler,
    format,
  };
  filterStates.set(state, fs);
  return fs;
}

function getOrCreateTextureBG(fs: WgpuFilterState, device: GPUDevice, view: GPUTextureView): GPUBindGroup {
  let bg = fs.textureBGs.get(view);
  if (bg === undefined) {
    bg = device.createBindGroup({
      layout: fs.textureBGLayout,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: fs.sampler },
      ],
    });
    fs.textureBGs.set(view, bg);
  }
  return bg;
}

function acquireUniformSlot(fs: WgpuFilterState): number {
  const offset = fs.uniformOffset;
  fs.uniformOffset = (offset + fs.uniformStride) % (fs.uniformSlots * fs.uniformStride);
  return offset;
}

function writeUniformSlot(
  state: WgpuRenderState,
  fs: WgpuFilterState,
  slotOffset: number,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const f32Start = slotOffset / 4;
  const slotF32 = fs.uniformData.subarray(f32Start, f32Start + fs.uniformStride / 4);
  const slotI32 = fs.uniformDataI32.subarray(f32Start, f32Start + fs.uniformStride / 4);
  setUniforms(slotF32, slotI32);
  state.device.queue.writeBuffer(fs.uniformBuffer, slotOffset, fs.uniformData.buffer, slotOffset, fs.uniformStride);
}

function beginFilterPass(
  state: WgpuRenderState,
  dest: WgpuRenderTarget | null,
  loadOp: GPULoadOp,
): GPURenderPassEncoder {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.commandEncoder === null) throw new Error('No active command encoder — call renderWgpuBackground first');
  if (runtime.renderPass !== null) {
    runtime.renderPass.end();
    runtime.renderPass = null;
  }
  const view = dest !== null ? dest.view : runtime.canvasTextureView!;
  const pass = runtime.commandEncoder.beginRenderPass({
    colorAttachments: [{ view, loadOp, storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
  });
  if (dest !== null) {
    pass.setViewport(0, 0, dest.width, dest.height, 0, 1);
  } else {
    const w = runtime.renderTargetViewport?.width ?? state.canvas.width;
    const h = runtime.renderTargetViewport?.height ?? state.canvas.height;
    pass.setViewport(0, 0, w, h, 0, 1);
  }
  return pass;
}

/** Clears a render target to fully transparent. Ends any active render pass. */
export function clearWgpuFilterTarget(state: WgpuRenderState, target: WgpuRenderTarget): void {
  const pass = beginFilterPass(state, target, 'clear');
  pass.end();
}

// Returns the GPURenderPipeline whose color target format matches `dest` (the canvas format when dest is
// null). Compiles and caches a per-format variant on demand so a filter built for the canvas format can
// still draw into an HDR (rgba16float) effect target without an attachment-format mismatch.
function resolveFilterPipeline(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuFilterPipeline>,
  dest: WgpuRenderTarget | null,
): GPURenderPipeline {
  const canvasFormat = getOrCreateFilterState(state).format;
  const targetFormat = dest !== null ? dest.format : canvasFormat;
  if (pipeline.compileForFormat === undefined || pipeline.variants === undefined || targetFormat === canvasFormat) {
    return pipeline.pipeline;
  }
  let variant = pipeline.variants.get(targetFormat);
  if (variant === undefined) {
    variant = pipeline.compileForFormat(targetFormat);
    pipeline.variants.set(targetFormat, variant);
  }
  return variant;
}

/** Compiles a dual-source WGSL filter pipeline (source0 = group 1, source1 = group 2). */
export function createWgpuDualSourcePipeline(
  state: WgpuRenderState,
  fragmentWGSL: string,
  blend: 'premul' | 'replace' = 'premul',
): WgpuDualSourcePipeline {
  const fs = getOrCreateFilterState(state);
  const { device } = state;

  const shaderModule = device.createShaderModule({ code: FILTER_VERTEX_WGSL + fragmentWGSL });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout, fs.textureBGLayout],
  });

  const compileForFormat = (format: GPUTextureFormat): GPURenderPipeline =>
    device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format, blend: blend === 'premul' ? PREMUL_BLEND : REPLACE_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
    });

  return { pipeline: compileForFormat(fs.format), blendMode: blend, compileForFormat, variants: new Map() };
}

/** Compiles a WGSL filter pipeline, creating the combined vertex+fragment shader module. */
export function createWgpuFilterPipeline(
  state: WgpuRenderState,
  fragmentWGSL: string,
  blend: 'premul' | 'replace' = 'premul',
): WgpuFilterPipeline {
  const fs = getOrCreateFilterState(state);
  const { device } = state;

  const shaderModule = device.createShaderModule({ code: FILTER_VERTEX_WGSL + fragmentWGSL });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout],
  });

  const compileForFormat = (format: GPUTextureFormat): GPURenderPipeline =>
    device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format, blend: blend === 'premul' ? PREMUL_BLEND : REPLACE_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
    });

  return { pipeline: compileForFormat(fs.format), blendMode: blend, compileForFormat, variants: new Map() };
}

/** Compiles a triple-source WGSL filter pipeline (source0 = group 1, source1 = group 2, source2 = group 3). */
export function createWgpuTripleSourcePipeline(
  state: WgpuRenderState,
  fragmentWGSL: string,
  blend: 'premul' | 'replace' = 'premul',
): WgpuFilterPipeline {
  const filterState = getOrCreateFilterState(state);
  const { device } = state;

  const shaderModule = device.createShaderModule({ code: FILTER_VERTEX_WGSL + fragmentWGSL });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [
      filterState.uniformBGLayout,
      filterState.textureBGLayout,
      filterState.textureBGLayout,
      filterState.textureBGLayout,
    ],
  });

  const compileForFormat = (format: GPUTextureFormat): GPURenderPipeline =>
    device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format, blend: blend === 'premul' ? PREMUL_BLEND : REPLACE_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
    });

  return { pipeline: compileForFormat(filterState.format), blendMode: blend, compileForFormat, variants: new Map() };
}

/**
 * Destroys the filter infrastructure (uniform ring buffer, bind groups, sampler) held
 * for `state`, freeing the associated GPU resources. Also evicts `state` from every
 * per-filter pipeline cache registered via `registerWgpuFilterPipelineCache` so the next
 * filter draw recompiles on the current device. Call when the render state itself is being
 * destroyed — for example when a WebGPU device is lost or an offscreen render target is torn
 * down. After this call any filter draw that re-uses `state` will re-create all infrastructure
 * from scratch. Idempotent.
 */
export function destroyWgpuFilterPipelines(state: WgpuRenderState): void {
  const fs = filterStates.get(state);
  if (fs === undefined) return;
  fs.uniformBuffer.destroy();
  filterStates.delete(state);
  for (const cache of ALL_WGPU_FILTER_PIPELINE_CACHES) cache.delete(state);
  for (const cache of pipelineCacheRegistry) cache.delete(state);
}

/**
 * Draws a full-screen pass reading from two source textures.
 * source0 binds to group 1, source1 to group 2.
 */
export function drawWgpuDualSourcePass(
  state: WgpuRenderState,
  source0: WgpuRenderTarget,
  source1: WgpuRenderTarget,
  dest: WgpuRenderTarget | null,
  pipeline: WgpuDualSourcePipeline,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const fs = getOrCreateFilterState(state);
  const { device } = state;

  const slotOffset = acquireUniformSlot(fs);
  writeUniformSlot(state, fs, slotOffset, setUniforms);

  const source0BG = getOrCreateTextureBG(fs, device, source0.view);
  const source1BG = getOrCreateTextureBG(fs, device, source1.view);

  const pass = beginFilterPass(state, dest, 'load');
  pass.setPipeline(resolveFilterPipeline(state, pipeline, dest));
  pass.setBindGroup(0, fs.uniformBG, [slotOffset]);
  pass.setBindGroup(1, source0BG);
  pass.setBindGroup(2, source1BG);
  pass.draw(6);
  pass.end();
}

/**
 * Draws a full-screen filter pass: reads from source (group 1), writes to dest.
 * `setUniforms` is called with Float32Array and Int32Array views into the current
 * ring-buffer slot for per-pass uniform uploads. Blend is premultiplied-alpha compositing.
 * Ends any active render pass; does not restore it.
 */
export function drawWgpuFilterPass(
  state: WgpuRenderState,
  source: WgpuRenderTarget,
  dest: WgpuRenderTarget | null,
  pipeline: WgpuFilterPipeline,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const fs = getOrCreateFilterState(state);
  const { device } = state;

  const slotOffset = acquireUniformSlot(fs);
  writeUniformSlot(state, fs, slotOffset, setUniforms);

  const sourceBG = getOrCreateTextureBG(fs, device, source.view);

  const pass = beginFilterPass(state, dest, 'load');
  pass.setPipeline(resolveFilterPipeline(state, pipeline, dest));
  pass.setBindGroup(0, fs.uniformBG, [slotOffset]);
  pass.setBindGroup(1, sourceBG);
  pass.draw(6);
  pass.end();
}

/**
 * Draws a full-screen pass reading from three source textures.
 * source0 = group 1, source1 = group 2, source2 = group 3.
 */
export function drawWgpuTripleSourcePass(
  state: WgpuRenderState,
  source0: WgpuRenderTarget,
  source1: WgpuRenderTarget,
  source2: WgpuRenderTarget,
  dest: WgpuRenderTarget | null,
  pipeline: WgpuFilterPipeline,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const fs = getOrCreateFilterState(state);
  const { device } = state;

  const slotOffset = acquireUniformSlot(fs);
  writeUniformSlot(state, fs, slotOffset, setUniforms);

  const source0BG = getOrCreateTextureBG(fs, device, source0.view);
  const source1BG = getOrCreateTextureBG(fs, device, source1.view);
  const source2BG = getOrCreateTextureBG(fs, device, source2.view);

  const pass = beginFilterPass(state, dest, 'load');
  pass.setPipeline(resolveFilterPipeline(state, pipeline, dest));
  pass.setBindGroup(0, fs.uniformBG, [slotOffset]);
  pass.setBindGroup(1, source0BG);
  pass.setBindGroup(2, source1BG);
  pass.setBindGroup(3, source2BG);
  pass.draw(6);
  pass.end();
}

/**
 * Returns the filter state for the given render state, for use in shaders
 * that need to bind a custom texture (e.g., a gradient ramp) as group 2 or 3.
 */
export function getWgpuFilterState(state: WgpuRenderState): {
  uniformBG: GPUBindGroup;
  textureBGLayout: GPUBindGroupLayout;
  uniformBGLayout: GPUBindGroupLayout;
  sampler: GPUSampler;
  acquireSlot: () => number;
  writeSlot: (offset: number, fn: (f32: Float32Array, i32: Int32Array) => void) => void;
  beginPass: (dest: WgpuRenderTarget | null, loadOp: GPULoadOp) => GPURenderPassEncoder;
} {
  const fs = getOrCreateFilterState(state);
  return {
    uniformBG: fs.uniformBG,
    textureBGLayout: fs.textureBGLayout,
    uniformBGLayout: fs.uniformBGLayout,
    sampler: fs.sampler,
    acquireSlot: () => acquireUniformSlot(fs),
    writeSlot: (offset, fn) => writeUniformSlot(state, fs, offset, fn),
    beginPass: (dest, loadOp) => beginFilterPass(state, dest, loadOp),
  };
}

/**
 * Registers a per-filter pipeline WeakMap with the central eviction registry. Call this
 * once per module-level WeakMap (at module load or first use). When `destroyWgpuFilterPipelines`
 * is called for a render state, it deletes that state's entry from every registered cache so
 * the next filter draw recompiles the pipeline on the current (possibly new) device.
 *
 * Filter modules that cache pipelines in a module-level
 * `WeakMap<WgpuRenderState, WgpuFilterPipeline>` should call this to participate in
 * device-loss recovery via `destroyWgpuFilterPipelines`.
 */
export function registerWgpuFilterPipelineCache(cache: WeakMap<WgpuRenderState, unknown>): void {
  pipelineCacheRegistry.push(cache);
}
