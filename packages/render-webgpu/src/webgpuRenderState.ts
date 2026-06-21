import { createMatrix } from '@flighthq/geometry';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  setRenderStateBackgroundColor,
} from '@flighthq/render';
import type { WebGPURenderOptions, WebGPURenderState, WebGPURenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { warmWebGPUPipelines } from './webgpuDraw';
import { createWebGPUBindGroupLayouts, UNIFORM_BYTE_SIZE } from './webgpuShader';

// Ring buffer: 4096 draw slots per frame. Stride is clamped to at least 256 by the spec.
const RING_SLOT_COUNT = 4096;

export async function createWebGPURenderState(
  canvas: HTMLCanvasElement,
  options: Partial<WebGPURenderOptions> = {},
): Promise<WebGPURenderState> {
  if (!navigator.gpu) throw new Error('WebGPU is not supported in this browser.');

  const adapter = await navigator.gpu.requestAdapter(
    options.powerPreference != null ? { powerPreference: options.powerPreference } : undefined,
  );
  if (!adapter) throw new Error('Failed to get WebGPU adapter.');

  const device = await adapter.requestDevice();

  const format = options.format ?? navigator.gpu.getPreferredCanvasFormat();

  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new Error('Failed to get WebGPU canvas context.');

  // COPY_SRC lets the canvas texture be read back via copyTextureToBuffer (createSurfaceFromWebGPURenderState).
  // It is the only reliable way to read a WebGPU frame in headless/software contexts, where canvas
  // presentation does not surface the swapchain; it also backs user-facing screenshot/save-pixels needs.
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  // Align uniform ring buffer slots to device limits
  const uniformStride = Math.max(256, device.limits.minUniformBufferOffsetAlignment, UNIFORM_BYTE_SIZE);
  const ringByteSize = uniformStride * RING_SLOT_COUNT;

  const uniformBuffer = device.createBuffer({
    size: ringByteSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformData = new Float32Array(ringByteSize / 4);
  const uniformDataU32 = new Uint32Array(uniformData.buffer);

  const { uniformBindGroupLayout, textureBindGroupLayout } = createWebGPUBindGroupLayouts(device);

  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer, size: UNIFORM_BYTE_SIZE } }],
  });

  const linearSampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const nearestSampler = device.createSampler({
    minFilter: 'nearest',
    magFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const state = _createRenderState({
    allowSmoothing: options.imageSmoothingEnabled ?? true,
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as WebGPURenderState;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  (state as { canvas: HTMLCanvasElement }).canvas = canvas;
  (state as { context: GPUCanvasContext }).context = context;
  (state as { device: GPUDevice }).device = device;
  (state as { format: GPUTextureFormat }).format = format;

  const runtime = createWebGPURenderStateRuntime();
  state[EntityRuntimeKey] = runtime;
  runtime.currentBlendMode = null;

  runtime.uniformBindGroupLayout = uniformBindGroupLayout;
  runtime.textureBindGroupLayout = textureBindGroupLayout;
  runtime.uniformBuffer = uniformBuffer;
  runtime.uniformData = uniformData;
  runtime.uniformDataU32 = uniformDataU32;
  runtime.uniformOffset = 0;
  runtime.uniformStride = uniformStride;
  runtime.uniformBindGroup = uniformBindGroup;
  runtime.matrixArray = new Float32Array(9);

  runtime.pipelineCache = new Map();
  runtime.linearSampler = linearSampler;
  runtime.nearestSampler = nearestSampler;
  runtime.textureCache = new WeakMap();
  runtime.defaultBitmapShader = null;

  runtime.particleInstanceBuffer = null;
  runtime.particleInstanceData = null;
  runtime.particleInstanceCapacity = 0;

  runtime.spriteBatchBlendMode = null;
  runtime.spriteBatchMaterial = null;
  runtime.spriteBatchMaterialRenderer = null;
  runtime.spriteBatchMaterialFloats = 0;
  runtime.spriteBatchCount = 0;
  runtime.spriteBatchInstanceData = new Float32Array(13 * 256);
  runtime.spriteBatchMaterialData = new Float32Array(8 * 256);
  runtime.spriteBatchTexture = null;
  runtime.spriteBatchBufferPool = [];
  runtime.spriteBatchBufferCursor = 0;

  runtime.commandEncoder = null;
  runtime.renderPass = null;
  runtime.canvasTextureView = null;
  runtime.canvasViewCleared = false;

  runtime.depthStencilTexture = null;
  runtime.depthStencilView = null;
  runtime.depthStencilWidth = 0;
  runtime.depthStencilHeight = 0;

  runtime.currentMaskDepth = 0;
  runtime.maskWriteMode = false;
  runtime.clipContourPipelines = null;
  runtime.clipContourStack = [];
  runtime.shapeMeshPipelines = undefined;
  runtime.clipForms = [];

  runtime.scissorStack = [];
  runtime.currentScissorRect = null;
  runtime.renderTargetViewport = null;
  runtime.renderTargetStack = [];

  warmWebGPUPipelines(state);

  return state;
}

// Allocates the package-private GPU runtime for a WebGPURenderState. createWebGPURenderState attaches
// one to each state under EntityRuntimeKey and populates its fields; getWebGPURenderStateRuntime reads
// it back. The render path writes the returned object every frame, so the return is intentionally
// mutable (not Readonly).
export function createWebGPURenderStateRuntime(): WebGPURenderStateRuntime {
  return createRenderStateRuntime() as WebGPURenderStateRuntime;
}

// Destroys the GPU buffers and textures createWebGPURenderState (and the lazy sprite-batch/particle
// paths) allocated on `state`: the uniform buffer, particle instance buffer, depth-stencil texture,
// and every sprite-batch pool slot's instance/material buffers. Call when the render state is no
// longer needed.
//
// Intentionally NOT touched: the GPUDevice (app-owned and shared — destroying it would tear down
// every state on it), and GC-managed WebGPU objects with no destroy() (pipelines, bind groups,
// layouts, samplers, shader modules, texture views). textureCache is a WeakMap and cannot be
// enumerated; its entries' textures are freed per-node by the dispose* paths.
export function destroyWebGPURenderState(state: WebGPURenderState): void {
  const runtime = getWebGPURenderStateRuntime(state);
  runtime.uniformBuffer?.destroy();
  runtime.particleInstanceBuffer?.destroy();
  runtime.depthStencilTexture?.destroy();
  for (const slot of runtime.spriteBatchBufferPool) {
    slot.instanceBuffer?.destroy();
    slot.materialBuffer?.destroy();
  }
}

// Resolves the package-private GPU runtime attached to a WebGPURenderState. Mutable by design: the
// render path writes its fields every frame.
export function getWebGPURenderStateRuntime(state: WebGPURenderState): WebGPURenderStateRuntime {
  return state[EntityRuntimeKey] as WebGPURenderStateRuntime;
}

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu !== null;
}
