import { createWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createRenderState } from '@flighthq/render/contract';
import type { WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

import { getWgpuSkinningAdapter } from './wgpuScene3DRuntime';
import { registerWgpuGpuSkinning } from './wgpuSkinPalette';

// A recording WgpuRenderState for scene-wgpu unit tests. The render-wgpu JSDOM mock device is no-op
// (records nothing), so 3D tests that exercise the pipeline cache / upload / draw path drive this
// hand-rolled stub instead. It records every device + render-pass call so a test can assert the GPU it
// drove, and returns plausible objects for the create*/queue queries the renderer makes. It is not a
// renderer — it produces no pixels — but it lets the CPU-side bind/draw/cache logic run to completion
// under JSDOM (mirrors scene-gl's makeGlScene3DState / FakeGl2).
export interface FakeWgpu {
  calls: { name: string; args: unknown[] }[];
}

// WebGPU flag constants are only type-level in @webgpu/types; install runtime values for JSDOM so the
// pipeline/buffer/texture descriptors the renderer builds resolve (mirrors render-wgpu's mock).
function installWgpuConstants(): void {
  const g = globalThis as Record<string, unknown>;
  if (!g['GPUBufferUsage']) {
    g['GPUBufferUsage'] = {
      MAP_READ: 1,
      MAP_WRITE: 2,
      COPY_SRC: 4,
      COPY_DST: 8,
      INDEX: 16,
      VERTEX: 32,
      UNIFORM: 64,
      STORAGE: 128,
      INDIRECT: 256,
      QUERY_RESOLVE: 512,
    };
  }
  if (!g['GPUTextureUsage']) {
    g['GPUTextureUsage'] = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  }
  if (!g['GPUShaderStage']) {
    g['GPUShaderStage'] = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  }
  if (!g['GPUColorWrite']) {
    g['GPUColorWrite'] = { RED: 1, GREEN: 2, BLUE: 4, ALPHA: 8, ALL: 15 };
  }
}

// A WgpuRenderState backed by the recording device, with an open recording render pass set on the
// runtime (so bind/draw find runtime.renderPass), the uniform ring buffer wired up (so the draw path
// can ring-allocate), and currentColorFormat set to the canvas format. scene-wgpu's own per-state
// runtime is created lazily on first getWgpuScene3DRuntime, exactly as in production.
export function makeWgpuScene3DState(): { fake: FakeWgpu; state: WgpuRenderState } {
  installWgpuConstants();
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]): unknown => {
      calls.push({ name, args });
      return result;
    };
  const writeBuffer = (...args: unknown[]): void => {
    validateWriteBufferDestinationOffset(args[1] as number);
    validateWriteBufferData(args[2], args[3] as number | undefined, args[4] as number | undefined);
    calls.push({ name: 'writeBuffer', args });
  };
  const writeTexture = (
    destination: GPUTexelCopyTextureInfo,
    data: GPUAllowSharedBufferSource,
    dataLayout: GPUTexelCopyBufferLayout,
    size: GPUExtent3D,
  ): void => {
    validateWriteTextureSourceAllocation(destination, data, dataLayout, size);
    calls.push({ name: 'writeTexture', args: [destination, data, dataLayout, size] });
  };
  const setIndexBuffer = (buffer: GPUBuffer, indexFormat: GPUIndexFormat, offset = 0, size?: number): void => {
    validateRenderBufferRange('setIndexBuffer', buffer, offset, size, indexFormat === 'uint32' ? 4 : 2);
    calls.push({ name: 'setIndexBuffer', args: [buffer, indexFormat, offset, size] });
  };
  const setVertexBuffer = (slot: number, buffer: GPUBuffer | null, offset = 0, size?: number): void => {
    if (buffer !== null) validateRenderBufferRange('setVertexBuffer', buffer, offset, size, 4);
    calls.push({ name: 'setVertexBuffer', args: [slot, buffer, offset, size] });
  };

  const renderPass = {
    draw: record('draw'),
    drawIndexed: record('drawIndexed'),
    end: record('end'),
    setBindGroup: record('setBindGroup'),
    setIndexBuffer,
    setPipeline: record('setPipeline'),
    setVertexBuffer,
    setViewport: record('setViewport'),
  } as unknown as GPURenderPassEncoder;

  // A recording command encoder whose beginRenderPass hands back the same recording pass — enough for
  // drawWgpuScene3DShadowMap and the IBL bake to drive their own render passes under JSDOM. `finish` returns
  // a plausible command buffer the recording queue's submit accepts.
  const commandEncoder = {
    beginRenderPass: record('beginRenderPass', renderPass),
    finish: record('finish', {}),
  } as unknown as GPUCommandEncoder;

  const device = {
    limits: { minUniformBufferOffsetAlignment: 256 },
    queue: {
      copyExternalImageToTexture: record('copyExternalImageToTexture'),
      submit: record('submit'),
      writeBuffer,
      writeTexture,
    },
    createBindGroup: record('createBindGroup', {}),
    createBindGroupLayout: record('createBindGroupLayout', {}),
    createCommandEncoder: () => {
      calls.push({ name: 'createCommandEncoder', args: [] });
      return commandEncoder;
    },
    createBuffer: (descriptor: GPUBufferDescriptor) => {
      calls.push({ name: 'createBuffer', args: [descriptor] });
      return { destroy: () => {}, size: descriptor.size } as unknown as GPUBuffer;
    },
    createPipelineLayout: record('createPipelineLayout', {}),
    createRenderPipeline: record('createRenderPipeline', {}),
    createSampler: record('createSampler', {}),
    createShaderModule: (descriptor: unknown) => {
      calls.push({ name: 'createShaderModule', args: [descriptor] });
      return {} as GPUShaderModule;
    },
    createTexture: (descriptor: GPUTextureDescriptor) => {
      calls.push({ name: 'createTexture', args: [descriptor] });
      const [width, height, depthOrArrayLayers] = normalizeGpuExtent3D(descriptor.size);
      return {
        createView: () => ({}) as GPUTextureView,
        depthOrArrayLayers,
        dimension: descriptor.dimension ?? '2d',
        destroy: () => {},
        format: descriptor.format,
        height,
        mipLevelCount: descriptor.mipLevelCount ?? 1,
        sampleCount: descriptor.sampleCount ?? 1,
        usage: descriptor.usage,
        width,
      } as unknown as GPUTexture;
    },
  } as unknown as GPUDevice;

  const canvas = { width: 256, height: 256 } as HTMLCanvasElement;
  const state = createRenderState({
    allowSmoothing: true,
    backgroundColorRgba: [0, 0, 0, 0],
  }) as WgpuRenderState;

  Object.assign(state, {
    applyBlendMode: null,
    canvas,
    context: {} as GPUCanvasContext,
    device,
    format: 'bgra8unorm',
    surface: { height: canvas.height, width: canvas.width },
  });

  const runtime = createWgpuRenderStateRuntime();
  Object.assign(runtime, {
    commandEncoder,
    currentBlendMode: null,
    currentColorFormat: 'bgra8unorm',
    textureSourcePremultipliedTextureCache: new WeakMap(),
    textureSourcePremultipliedSrgbTextureCache: new WeakMap(),
    textureSourceStraightTextureCache: new WeakMap(),
    textureSourceStraightSrgbTextureCache: new WeakMap(),
    mipmapPipelineCache: new Map(),
    pipelineCache: new Map(),
    textureBindGroupLayout: {} as GPUBindGroupLayout,
    linearSampler: {} as GPUSampler,
    nearestSampler: {} as GPUSampler,
    samplerCache: new Map(),
    textureCache: new WeakMap(),
    renderPass,
    renderTargetViewport: null,
    uniformBuffer: { destroy: () => {} } as unknown as GPUBuffer,
    uniformBindGroupLayout: {} as GPUBindGroupLayout,
    uniformData: new Float32Array(256 * 64),
    uniformDataU32: new Uint32Array(0),
    uniformOffset: 0,
    uniformStride: 256,
  } satisfies Partial<WgpuRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  return { fake: { calls }, state };
}

export function makeWgpuSkinningAdapter(): WgpuSkinningAdapter {
  const { state } = makeWgpuScene3DState();
  registerWgpuGpuSkinning(state);
  return getWgpuSkinningAdapter(state)!;
}

// Mirrors writeBuffer's synchronous BufferSource validation. Typed-array dataOffset/size values are
// element counts; ArrayBuffer and DataView values are bytes. Keeping this at the fake queue boundary
// makes every scene3d-wgpu unit path reject a call that a browser would reject before scheduling it.
function validateWriteBufferData(data: unknown, dataOffset = 0, size?: number): void {
  const isArrayBuffer = data instanceof ArrayBuffer;
  const isSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer;
  const isView = ArrayBuffer.isView(data);
  if (!isArrayBuffer && !isSharedArrayBuffer && !isView) {
    throw new TypeError('GPUQueue.writeBuffer: data must be a BufferSource');
  }

  const elementByteLength = isView && !(data instanceof DataView) ? getTypedArrayElementByteLength(data) : 1;
  const dataElementLength = data.byteLength / elementByteLength;
  const contentElementLength = size ?? dataElementLength - dataOffset;
  if (contentElementLength < 0 || dataOffset + contentElementLength > dataElementLength) {
    throw new DOMException('GPUQueue.writeBuffer: data range is out of bounds', 'OperationError');
  }
  if ((contentElementLength * elementByteLength) % 4 !== 0) {
    throw new DOMException('GPUQueue.writeBuffer: content byte length must be a multiple of 4', 'OperationError');
  }
}

function getTypedArrayElementByteLength(data: ArrayBufferView): number {
  return (data as ArrayBufferView & { readonly BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
}

function getWriteTextureBytesPerTexel(format: GPUTextureFormat): number | null {
  if (
    format === 'rgba8unorm' ||
    format === 'rgba8unorm-srgb' ||
    format === 'bgra8unorm' ||
    format === 'bgra8unorm-srgb'
  ) {
    return 4;
  }
  if (format === 'rgba32float') return 16;
  return null;
}

function normalizeGpuExtent3D(size: GPUExtent3D): [number, number, number] {
  if (Symbol.iterator in Object(size)) {
    const values = Array.from(size as Iterable<number>);
    return [values[0] ?? 1, values[1] ?? 1, values[2] ?? 1];
  }
  const dictionary = size as GPUExtent3DDict;
  return [dictionary.width, dictionary.height ?? 1, dictionary.depthOrArrayLayers ?? 1];
}

// Keep source-allocation validation scoped to the uncompressed formats used by this helper's
// writeTexture paths. Block-compressed formats need a separate block-geometry model.
function validateWriteTextureSourceAllocation(
  destination: GPUTexelCopyTextureInfo,
  data: GPUAllowSharedBufferSource,
  dataLayout: GPUTexelCopyBufferLayout,
  size: GPUExtent3D,
): void {
  const isArrayBuffer = data instanceof ArrayBuffer;
  const isSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer;
  const isView = ArrayBuffer.isView(data);
  if (!isArrayBuffer && !isSharedArrayBuffer && !isView) {
    throw new TypeError('GPUQueue.writeTexture: data must be a BufferSource');
  }

  const bytesPerTexel = getWriteTextureBytesPerTexel(destination.texture.format);
  if (bytesPerTexel === null) return;
  const [width, height, depthOrArrayLayers] = normalizeGpuExtent3D(size);
  if (width === 0 || height === 0 || depthOrArrayLayers === 0) return;
  const bytesInLastRow = width * bytesPerTexel;
  const bytesPerRow = Math.max(bytesInLastRow, dataLayout.bytesPerRow ?? bytesInLastRow);
  const rowsPerImage = Math.max(height, dataLayout.rowsPerImage ?? height);
  const requiredByteLength =
    (dataLayout.offset ?? 0) +
    bytesPerRow * rowsPerImage * (depthOrArrayLayers - 1) +
    bytesPerRow * (height - 1) +
    bytesInLastRow;
  if (requiredByteLength > data.byteLength) {
    throw new DOMException(
      `GPUQueue.writeTexture: data byte length ${data.byteLength} is smaller than the ${requiredByteLength} bytes required by the copy`,
      'OperationError',
    );
  }
}

// These are the numeric buffer-binding constraints Flight derives from mesh data. The fake buffers
// expose the same public size field as GPUBuffer; hand-authored opaque buffers remain record-only.
function validateRenderBufferRange(
  call: 'setIndexBuffer' | 'setVertexBuffer',
  buffer: GPUBuffer,
  offset: number,
  size: number | undefined,
  offsetAlignment: number,
): void {
  if (offset < 0 || (size !== undefined && size < 0)) {
    throw new Error(`Fake GPU validation: ${call} offset and size must be non-negative`);
  }
  if (offset % offsetAlignment !== 0) {
    throw new Error(`Fake GPU validation: ${call} offset must be aligned to ${offsetAlignment} bytes`);
  }

  const bufferSize = buffer.size;
  if (typeof bufferSize !== 'number') return;
  const rangeSize = size ?? Math.max(0, bufferSize - offset);
  if (offset + rangeSize > bufferSize) {
    throw new Error(`Fake GPU validation: ${call} range exceeds the buffer size`);
  }
}

function validateWriteBufferDestinationOffset(bufferOffset: number): void {
  if (bufferOffset % 4 !== 0) {
    throw new Error('Fake GPU validation: GPUQueue.writeBuffer destination offset must be aligned to 4 bytes');
  }
}
