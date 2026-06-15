import type { WebGPURenderStateInternal } from '@flighthq/render-webgpu';
import type { WebGPURenderState, WebGPURenderTarget } from '@flighthq/types';

// Shared vertex shader: full-screen quad via vertex_index, no vertex buffer needed.
// UV convention: y=0 = texture top, y=1 = texture bottom (WebGPU top-left origin).
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

// Premultiplied-alpha compositing blend state, matching WebGL's ONE + ONE_MINUS_SRC_ALPHA.
const PREMUL_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

// Opaque / replace blend: writes the filter result directly without compositing.
const REPLACE_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
};

export type WebGPUFilterPipeline = {
  pipeline: GPURenderPipeline;
  blendMode: 'premul' | 'replace';
};

export type WebGPUDualSourcePipeline = WebGPUFilterPipeline;

// Per-render-state filter infrastructure: ring buffer for uniforms, shared layouts,
// and texture bind-group cache keyed by GPUTextureView.
type WebGPUFilterState = {
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

const filterStates = new WeakMap<WebGPURenderState, WebGPUFilterState>();

function getOrCreateFilterState(state: WebGPURenderState): WebGPUFilterState {
  let fs = filterStates.get(state);
  if (fs !== undefined) return fs;

  const internal = state as WebGPURenderStateInternal;
  const { device, format } = internal;

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

function getOrCreateTextureBG(fs: WebGPUFilterState, device: GPUDevice, view: GPUTextureView): GPUBindGroup {
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

function acquireUniformSlot(fs: WebGPUFilterState): number {
  const offset = fs.uniformOffset;
  fs.uniformOffset = (offset + fs.uniformStride) % (fs.uniformSlots * fs.uniformStride);
  return offset;
}

function writeUniformSlot(
  internal: WebGPURenderStateInternal,
  fs: WebGPUFilterState,
  slotOffset: number,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const f32Start = slotOffset / 4;
  const slotF32 = fs.uniformData.subarray(f32Start, f32Start + fs.uniformStride / 4);
  const slotI32 = fs.uniformDataI32.subarray(f32Start, f32Start + fs.uniformStride / 4);
  setUniforms(slotF32, slotI32);
  internal.device.queue.writeBuffer(fs.uniformBuffer, slotOffset, fs.uniformData.buffer, slotOffset, fs.uniformStride);
}

function beginFilterPass(
  internal: WebGPURenderStateInternal,
  dest: WebGPURenderTarget | null,
  loadOp: GPULoadOp,
): GPURenderPassEncoder {
  if (internal.commandEncoder === null)
    throw new Error('No active command encoder — call renderWebGPUBackground first');
  if (internal.renderPass !== null) {
    internal.renderPass.end();
    internal.renderPass = null;
  }
  const view = dest !== null ? dest.view : internal.canvasTextureView!;
  const pass = internal.commandEncoder.beginRenderPass({
    colorAttachments: [{ view, loadOp, storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
  });
  if (dest !== null) {
    pass.setViewport(0, 0, dest.width, dest.height, 0, 1);
  } else {
    const w = internal.renderTargetViewport?.width ?? internal.canvas.width;
    const h = internal.renderTargetViewport?.height ?? internal.canvas.height;
    pass.setViewport(0, 0, w, h, 0, 1);
  }
  return pass;
}

/** Clears a render target to fully transparent. Ends any active render pass. */
export function clearWebGPUFilterTarget(state: WebGPURenderState, target: WebGPURenderTarget): void {
  const internal = state as WebGPURenderStateInternal;
  const pass = beginFilterPass(internal, target, 'clear');
  pass.end();
}

/** Compiles a dual-source WGSL filter pipeline (source0 = group 1, source1 = group 2). */
export function createWebGPUDualSourcePipeline(
  state: WebGPURenderState,
  fragmentWGSL: string,
  blend: 'premul' | 'replace' = 'premul',
): WebGPUDualSourcePipeline {
  const fs = getOrCreateFilterState(state);
  const internal = state as WebGPURenderStateInternal;
  const { device } = internal;

  const shaderModule = device.createShaderModule({ code: FILTER_VERTEX_WGSL + fragmentWGSL });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout, fs.textureBGLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format: fs.format, blend: blend === 'premul' ? PREMUL_BLEND : REPLACE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return { pipeline, blendMode: blend };
}

/** Compiles a WGSL filter pipeline, creating the combined vertex+fragment shader module. */
export function createWebGPUFilterPipeline(
  state: WebGPURenderState,
  fragmentWGSL: string,
  blend: 'premul' | 'replace' = 'premul',
): WebGPUFilterPipeline {
  const fs = getOrCreateFilterState(state);
  const internal = state as WebGPURenderStateInternal;
  const { device } = internal;

  const shaderModule = device.createShaderModule({ code: FILTER_VERTEX_WGSL + fragmentWGSL });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [fs.uniformBGLayout, fs.textureBGLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format: fs.format, blend: blend === 'premul' ? PREMUL_BLEND : REPLACE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return { pipeline, blendMode: blend };
}

/** Compiles a triple-source WGSL filter pipeline (source0 = group 1, source1 = group 2, source2 = group 3). */
export function createWebGPUTripleSourcePipeline(
  state: WebGPURenderState,
  fragmentWGSL: string,
  blend: 'premul' | 'replace' = 'premul',
): WebGPUFilterPipeline {
  const filterState = getOrCreateFilterState(state);
  const internal = state as WebGPURenderStateInternal;
  const { device } = internal;

  const shaderModule = device.createShaderModule({ code: FILTER_VERTEX_WGSL + fragmentWGSL });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [
      filterState.uniformBGLayout,
      filterState.textureBGLayout,
      filterState.textureBGLayout,
      filterState.textureBGLayout,
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: shaderModule, entryPoint: 'vs_main' },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format: filterState.format, blend: blend === 'premul' ? PREMUL_BLEND : REPLACE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return { pipeline, blendMode: blend };
}

/**
 * Draws a full-screen pass reading from two source textures.
 * source0 binds to group 1, source1 to group 2.
 */
export function drawWebGPUDualSourcePass(
  state: WebGPURenderState,
  source0: WebGPURenderTarget,
  source1: WebGPURenderTarget,
  dest: WebGPURenderTarget | null,
  pipeline: WebGPUDualSourcePipeline,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const internal = state as WebGPURenderStateInternal;
  const fs = getOrCreateFilterState(state);
  const { device } = internal;

  const slotOffset = acquireUniformSlot(fs);
  writeUniformSlot(internal, fs, slotOffset, setUniforms);

  const source0BG = getOrCreateTextureBG(fs, device, source0.view);
  const source1BG = getOrCreateTextureBG(fs, device, source1.view);

  const pass = beginFilterPass(internal, dest, 'load');
  pass.setPipeline(pipeline.pipeline);
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
export function drawWebGPUFilterPass(
  state: WebGPURenderState,
  source: WebGPURenderTarget,
  dest: WebGPURenderTarget | null,
  pipeline: WebGPUFilterPipeline,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const internal = state as WebGPURenderStateInternal;
  const fs = getOrCreateFilterState(state);
  const { device } = internal;

  const slotOffset = acquireUniformSlot(fs);
  writeUniformSlot(internal, fs, slotOffset, setUniforms);

  const sourceBG = getOrCreateTextureBG(fs, device, source.view);

  const pass = beginFilterPass(internal, dest, 'load');
  pass.setPipeline(pipeline.pipeline);
  pass.setBindGroup(0, fs.uniformBG, [slotOffset]);
  pass.setBindGroup(1, sourceBG);
  pass.draw(6);
  pass.end();
}

/**
 * Draws a full-screen pass reading from three source textures.
 * source0 = group 1, source1 = group 2, source2 = group 3.
 */
export function drawWebGPUTripleSourcePass(
  state: WebGPURenderState,
  source0: WebGPURenderTarget,
  source1: WebGPURenderTarget,
  source2: WebGPURenderTarget,
  dest: WebGPURenderTarget | null,
  pipeline: WebGPUFilterPipeline,
  setUniforms: (f32: Float32Array, i32: Int32Array) => void,
): void {
  const internal = state as WebGPURenderStateInternal;
  const fs = getOrCreateFilterState(state);
  const { device } = internal;

  const slotOffset = acquireUniformSlot(fs);
  writeUniformSlot(internal, fs, slotOffset, setUniforms);

  const source0BG = getOrCreateTextureBG(fs, device, source0.view);
  const source1BG = getOrCreateTextureBG(fs, device, source1.view);
  const source2BG = getOrCreateTextureBG(fs, device, source2.view);

  const pass = beginFilterPass(internal, dest, 'load');
  pass.setPipeline(pipeline.pipeline);
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
export function getWebGPUFilterState(state: WebGPURenderState): {
  uniformBG: GPUBindGroup;
  textureBGLayout: GPUBindGroupLayout;
  uniformBGLayout: GPUBindGroupLayout;
  sampler: GPUSampler;
  acquireSlot: () => number;
  writeSlot: (offset: number, fn: (f32: Float32Array, i32: Int32Array) => void) => void;
  beginPass: (dest: WebGPURenderTarget | null, loadOp: GPULoadOp) => GPURenderPassEncoder;
} {
  const fs = getOrCreateFilterState(state);
  const internal = state as WebGPURenderStateInternal;
  return {
    uniformBG: fs.uniformBG,
    textureBGLayout: fs.textureBGLayout,
    uniformBGLayout: fs.uniformBGLayout,
    sampler: fs.sampler,
    acquireSlot: () => acquireUniformSlot(fs),
    writeSlot: (offset, fn) => writeUniformSlot(internal, fs, offset, fn),
    beginPass: (dest, loadOp) => beginFilterPass(internal, dest, loadOp),
  };
}
