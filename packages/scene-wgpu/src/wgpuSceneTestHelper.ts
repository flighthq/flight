import { createRenderState } from '@flighthq/render';
import { createWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { WgpuRenderState, WgpuRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

// A recording WgpuRenderState for scene-wgpu unit tests. The render-wgpu JSDOM mock device is no-op
// (records nothing), so 3D tests that exercise the pipeline cache / upload / draw path drive this
// hand-rolled stub instead. It records every device + render-pass call so a test can assert the GPU it
// drove, and returns plausible objects for the create*/queue queries the renderer makes. It is not a
// renderer — it produces no pixels — but it lets the CPU-side bind/draw/cache logic run to completion
// under JSDOM (mirrors scene-gl's makeGlSceneState / FakeGl2).
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
}

// A WgpuRenderState backed by the recording device, with an open recording render pass set on the
// runtime (so bind/draw find runtime.renderPass), the uniform ring buffer wired up (so the draw path
// can ring-allocate), and currentColorFormat set to the canvas format. scene-wgpu's own per-state
// runtime is created lazily on first getWgpuSceneRuntime, exactly as in production.
export function makeWgpuSceneState(): { fake: FakeWgpu; state: WgpuRenderState } {
  installWgpuConstants();
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]): unknown => {
      calls.push({ name, args });
      return result;
    };

  const renderPass = {
    draw: record('draw'),
    drawIndexed: record('drawIndexed'),
    end: record('end'),
    setBindGroup: record('setBindGroup'),
    setIndexBuffer: record('setIndexBuffer'),
    setPipeline: record('setPipeline'),
    setVertexBuffer: record('setVertexBuffer'),
    setViewport: record('setViewport'),
  } as unknown as GPURenderPassEncoder;

  // A recording command encoder whose beginRenderPass hands back the same recording pass — enough for
  // drawWgpuSceneShadowMap and the IBL bake to drive their own render passes under JSDOM. `finish` returns
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
      writeBuffer: record('writeBuffer'),
      writeTexture: record('writeTexture'),
    },
    createBindGroup: record('createBindGroup', {}),
    createBindGroupLayout: record('createBindGroupLayout', {}),
    createCommandEncoder: () => {
      calls.push({ name: 'createCommandEncoder', args: [] });
      return commandEncoder;
    },
    createBuffer: (descriptor: unknown) => {
      calls.push({ name: 'createBuffer', args: [descriptor] });
      return { destroy: () => {} } as unknown as GPUBuffer;
    },
    createPipelineLayout: record('createPipelineLayout', {}),
    createRenderPipeline: record('createRenderPipeline', {}),
    createSampler: record('createSampler', {}),
    createShaderModule: (descriptor: unknown) => {
      calls.push({ name: 'createShaderModule', args: [descriptor] });
      return {} as GPUShaderModule;
    },
    createTexture: (descriptor: unknown) => {
      calls.push({ name: 'createTexture', args: [descriptor] });
      return { createView: () => ({}) as GPUTextureView, destroy: () => {} } as unknown as GPUTexture;
    },
  } as unknown as GPUDevice;

  const canvas = { width: 256, height: 256 } as HTMLCanvasElement;
  const state = createRenderState({
    allowSmoothing: true,
    backgroundColorRgba: [0, 0, 0, 0],
  }) as WgpuRenderState;

  Object.assign(state, { applyBlendMode: null, canvas, device, format: 'bgra8unorm' });

  const runtime = createWgpuRenderStateRuntime();
  Object.assign(runtime, {
    commandEncoder,
    currentBlendMode: null,
    currentColorFormat: 'bgra8unorm',
    imageResourceTextureCache: new WeakMap(),
    linearSampler: {} as GPUSampler,
    nearestSampler: {} as GPUSampler,
    samplerCache: new Map(),
    textureCache: new WeakMap(),
    renderPass,
    renderTargetViewport: null,
    uniformBuffer: { destroy: () => {} } as unknown as GPUBuffer,
    uniformData: new Float32Array(256 * 64),
    uniformDataU32: new Uint32Array(0),
    uniformOffset: 0,
    uniformStride: 256,
  } satisfies Partial<WgpuRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  return { fake: { calls }, state };
}
