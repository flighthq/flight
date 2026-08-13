import type { WgpuRenderState } from '@flighthq/types/contract';

import { createWgpuRenderState } from './wgpuRenderState';

// Wgpu flag constants are only type-level in @webgpu/types; install runtime values for JSDOM.
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
  if (!g['GPUMapMode']) {
    g['GPUMapMode'] = { READ: 1, WRITE: 2 };
  }
}

// Minimal Wgpu mock for JSDOM test environments.
// Provides enough surface area for state creation and basic draw call recording.

function makeBindGroup(): GPUBindGroup {
  return {} as GPUBindGroup;
}

function makeBindGroupLayout(): GPUBindGroupLayout {
  return {} as GPUBindGroupLayout;
}

function makeBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
  return {
    destroy: () => {},
    size: descriptor.size,
    usage: descriptor.usage,
  } as unknown as GPUBuffer;
}

function makeTexture(): GPUTexture {
  return {
    createView: () => ({}) as GPUTextureView,
    destroy: () => {},
  } as unknown as GPUTexture;
}

function makeRenderPassEncoder(): GPURenderPassEncoder {
  return {
    draw: () => {},
    end: () => {},
    setBindGroup: () => {},
    setPipeline: () => {},
    setScissorRect: () => {},
    setStencilReference: () => {},
    setViewport: () => {},
  } as unknown as GPURenderPassEncoder;
}

function makeCommandEncoder(): GPUCommandEncoder {
  return {
    beginRenderPass: () => makeRenderPassEncoder(),
    finish: () => ({}) as GPUCommandBuffer,
  } as unknown as GPUCommandEncoder;
}

// The descriptor is stashed on the returned pipeline so tests can assert blend/target state the
// real device would consume but the mock otherwise discards.
function makePipeline(descriptor?: GPURenderPipelineDescriptor): GPURenderPipeline {
  return { __descriptor: descriptor } as unknown as GPURenderPipeline;
}

function makeShaderModule(): GPUShaderModule {
  return {} as GPUShaderModule;
}

function makeSampler(): GPUSampler {
  return {} as GPUSampler;
}

function makePipelineLayout(): GPUPipelineLayout {
  return {} as GPUPipelineLayout;
}

function makeDevice(): GPUDevice {
  const writeBuffer = (
    buffer: GPUBuffer,
    bufferOffset: number,
    data: unknown,
    dataOffset?: number,
    size?: number,
  ): void => {
    validateWriteBufferDestination(buffer, bufferOffset, data, dataOffset, size);
  };

  return {
    features: new Set(),
    limits: { maxTextureDimension2D: 8192, minUniformBufferOffsetAlignment: 256 },
    createBindGroup: () => makeBindGroup(),
    createBindGroupLayout: () => makeBindGroupLayout(),
    createBuffer: (descriptor: GPUBufferDescriptor) => makeBuffer(descriptor),
    createCommandEncoder: () => makeCommandEncoder(),
    createPipelineLayout: () => makePipelineLayout(),
    createRenderPipeline: (descriptor: GPURenderPipelineDescriptor) => makePipeline(descriptor),
    createSampler: () => makeSampler(),
    createShaderModule: () => makeShaderModule(),
    createTexture: () => makeTexture(),
    queue: {
      copyExternalImageToTexture: () => {},
      submit: () => {},
      writeBuffer,
      writeTexture: () => {},
    },
  } as unknown as GPUDevice;
}

// Mirror writeBuffer's synchronous BufferSource checks and the destination constraints that a real
// device reports through GPU validation. This mock backs unit paths in three WGPU packages, so the
// validation belongs at their shared fake-device boundary rather than in individual interaction tests.
function validateWriteBufferDestination(
  buffer: GPUBuffer,
  bufferOffset: number,
  data: unknown,
  dataOffset = 0,
  size?: number,
): void {
  const isArrayBuffer = data instanceof ArrayBuffer;
  const isSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer;
  const isView = ArrayBuffer.isView(data);
  if (!isArrayBuffer && !isSharedArrayBuffer && !isView) {
    throw new TypeError('GPUQueue.writeBuffer: data must be a BufferSource');
  }
  if (!Number.isSafeInteger(bufferOffset) || bufferOffset < 0 || bufferOffset % 4 !== 0) {
    throw new DOMException('GPUQueue.writeBuffer: bufferOffset must be a non-negative multiple of 4', 'OperationError');
  }
  if (
    !Number.isSafeInteger(dataOffset) ||
    dataOffset < 0 ||
    (size !== undefined && (!Number.isSafeInteger(size) || size < 0))
  ) {
    throw new DOMException('GPUQueue.writeBuffer: data range is invalid', 'OperationError');
  }

  const elementByteLength = isView && !(data instanceof DataView) ? getTypedArrayElementByteLength(data) : 1;
  const dataElementLength = data.byteLength / elementByteLength;
  const contentElementLength = size ?? dataElementLength - dataOffset;
  if (contentElementLength < 0 || dataOffset + contentElementLength > dataElementLength) {
    throw new DOMException('GPUQueue.writeBuffer: data range is out of bounds', 'OperationError');
  }

  const contentByteLength = contentElementLength * elementByteLength;
  if (contentByteLength % 4 !== 0) {
    throw new DOMException('GPUQueue.writeBuffer: content byte length must be a multiple of 4', 'OperationError');
  }
  if ((buffer.usage & GPUBufferUsage.COPY_DST) === 0) {
    throw new Error('Fake GPU validation: GPUQueue.writeBuffer destination buffer must have COPY_DST usage');
  }
  if (bufferOffset + contentByteLength > buffer.size) {
    throw new Error('Fake GPU validation: GPUQueue.writeBuffer destination range exceeds the buffer size');
  }
}

function getTypedArrayElementByteLength(data: ArrayBufferView): number {
  return (data as ArrayBufferView & { readonly BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
}

function makeAdapter(): GPUAdapter {
  return {
    // A real GPUAdapter always exposes `.limits`; the forward-lit pipeline's device request reads
    // maxBindGroups off it. Report 8 (the common desktop cap) so the 5-group request path is exercised.
    limits: { maxBindGroups: 8, minUniformBufferOffsetAlignment: 256 },
    features: new Set(),
    requestDevice: () => Promise.resolve(makeDevice()),
  } as unknown as GPUAdapter;
}

// JSDOM does not decode image elements, so a bare <img> remains incomplete even when its layout
// width and height are assigned. Use this fixture when a test needs to exercise a successful external
// image upload; readiness-failure tests should keep constructing the incomplete element directly.
export function createReadyImageElementForTest(width = 1, height = 1): HTMLImageElement {
  const image = document.createElement('img');
  image.width = width;
  image.height = height;
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalHeight: { configurable: true, value: height },
    naturalWidth: { configurable: true, value: width },
  });
  return image;
}

export async function createWgpuRenderStateForTest(): Promise<WgpuRenderState> {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  return createWgpuRenderState(canvas);
}

export function installWgpuMock(): void {
  installWgpuConstants();
  const gpu: GPU = {
    getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
    requestAdapter: () => Promise.resolve(makeAdapter()),
  } as unknown as GPU;

  // A shared (isolate:false) worker may reach this helper with no navigator present; defineProperty
  // on a missing navigator throws, so ensure one exists before attaching the mock GPU.
  if (globalThis.navigator == null) {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  }
  Object.defineProperty(globalThis.navigator, 'gpu', {
    value: gpu,
    configurable: true,
    writable: true,
  });

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown,
  ) {
    if (contextId === 'webgpu') {
      return {
        configure: () => {},
        getCurrentTexture: () => makeTexture(),
      } as unknown as GPUCanvasContext;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origGetContext as any).call(this, contextId, options);
  };
}
