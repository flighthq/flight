import type { WgpuRenderState } from '@flighthq/types';

import { createWgpuRenderState } from './webgpuRenderState';

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

function makeBuffer(): GPUBuffer {
  return { destroy: () => {} } as unknown as GPUBuffer;
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

function makePipeline(): GPURenderPipeline {
  return {} as GPURenderPipeline;
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
  return {
    limits: { minUniformBufferOffsetAlignment: 256 },
    createBindGroup: () => makeBindGroup(),
    createBindGroupLayout: () => makeBindGroupLayout(),
    createBuffer: () => makeBuffer(),
    createCommandEncoder: () => makeCommandEncoder(),
    createPipelineLayout: () => makePipelineLayout(),
    createRenderPipeline: () => makePipeline(),
    createSampler: () => makeSampler(),
    createShaderModule: () => makeShaderModule(),
    createTexture: () => makeTexture(),
    queue: {
      copyExternalImageToTexture: () => {},
      submit: () => {},
      writeBuffer: () => {},
      writeTexture: () => {},
    },
  } as unknown as GPUDevice;
}

function makeAdapter(): GPUAdapter {
  return {
    requestDevice: () => Promise.resolve(makeDevice()),
  } as unknown as GPUAdapter;
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
