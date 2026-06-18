import { createMatrix } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setRenderStateBackgroundColor } from '@flighthq/render';
import type { WebGPURenderOptions, WebGPURenderState } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
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

  context.configure({ device, format, alphaMode: 'premultiplied' });

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
  }) as WebGPURenderStateInternal;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  state.canvas = canvas;
  state.context = context;
  state.device = device;
  state.format = format;
  state.currentBlendMode = null;

  state.uniformBindGroupLayout = uniformBindGroupLayout;
  state.textureBindGroupLayout = textureBindGroupLayout;
  state.uniformBuffer = uniformBuffer;
  state.uniformData = uniformData;
  state.uniformDataU32 = uniformDataU32;
  state.uniformOffset = 0;
  state.uniformStride = uniformStride;
  state.uniformBindGroup = uniformBindGroup;
  state.matrixArray = new Float32Array(9);

  state.pipelineCache = new Map();
  state.linearSampler = linearSampler;
  state.nearestSampler = nearestSampler;
  state.textureCache = new WeakMap();
  state.defaultBitmapShader = null;

  state.particleInstanceBuffer = null;
  state.particleInstanceData = null;
  state.particleInstanceCapacity = 0;

  state.spriteBatchBlendMode = null;
  state.spriteBatchMaterial = null;
  state.spriteBatchMaterialRenderer = null;
  state.spriteBatchMaterialFloats = 0;
  state.spriteBatchCount = 0;
  state.spriteBatchInstanceData = new Float32Array(13 * 256);
  state.spriteBatchMaterialData = new Float32Array(8 * 256);
  state.spriteBatchTexture = null;
  state.spriteBatchBufferPool = [];
  state.spriteBatchBufferCursor = 0;

  state.commandEncoder = null;
  state.renderPass = null;
  state.canvasTextureView = null;
  state.canvasViewCleared = false;

  state.depthStencilTexture = null;
  state.depthStencilView = null;
  state.depthStencilWidth = 0;
  state.depthStencilHeight = 0;

  state.currentMaskDepth = 0;
  state.maskWriteMode = false;

  state.scissorStack = [];
  state.currentScissorRect = null;
  state.renderTargetViewport = null;
  state.renderTargetStack = [];

  warmWebGPUPipelines(state);

  return state;
}

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu !== null;
}
