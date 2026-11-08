import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/entity/contract';
import { createWgpuDeviceState, createWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type {
  WgpuBindGroupLayout,
  WgpuBuffer,
  WgpuBufferDescriptor,
  WgpuBufferSource,
  WgpuCommandEncoder,
  WgpuDevice,
  WgpuExtent3D,
  WgpuExtent3DDict,
  WgpuIndexFormat,
  WgpuRenderPass,
  WgpuRenderPassEncoder,
  WgpuRenderState,
  WgpuRenderStateOptions,
  WgpuRenderStateRuntime,
  WgpuSampler,
  WgpuShaderModule,
  WgpuTexelCopyBufferLayout,
  WgpuTexelCopyTextureInfo,
  WgpuTexture,
  WgpuTextureDescriptor,
  WgpuTextureFormat,
  WgpuTextureRenderTarget,
  WgpuTextureView,
} from '@flighthq/render-wgpu/contract';
import type { WgpuSkinningAdapter } from '@flighthq/render-wgpu/contract';
import { createRenderState } from '@flighthq/render/contract';

import { getWgpuSkinningAdapter } from './wgpuScene3DRuntime.ts';
import { registerWgpuGpuSkinning } from './wgpuSkinPalette.ts';

// A recording WgpuRenderState for scene-wgpu unit tests. The render-wgpu JSDOM mock device is no-op
// (records nothing), so 3D tests that exercise the pipeline cache / upload / draw path drive this
// hand-rolled stub instead. It records every device + render-pass call so a test can assert the GPU it
// drove, and returns plausible objects for the create*/queue queries the renderer makes. It is not a
// renderer — it produces no pixels — but it lets the CPU-side bind/draw/cache logic run to completion
// under JSDOM (mirrors scene-gl's makeGlScene3DState / FakeGl2).
export interface FakeWgpu {
  calls: { name: string; args: unknown[] }[];
}

// A WgpuRenderState backed by the recording device, with an open recording render pass set on the
// runtime (so bind/draw find runtime.renderPass), the uniform ring buffer wired up (so the draw path
// can ring-allocate), and currentColorFormat set to the canvas format. scene-wgpu's own per-state
// runtime is created lazily on first getWgpuScene3DRuntime, exactly as in production.
export function makeWgpuScene3DState(registry: Readonly<WgpuRenderStateOptions> = {}): {
  fake: FakeWgpu;
  pass: WgpuRenderPass;
  state: WgpuRenderState;
} {
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
    destination: WgpuTexelCopyTextureInfo,
    data: WgpuBufferSource,
    dataLayout: WgpuTexelCopyBufferLayout,
    size: WgpuExtent3D,
  ): void => {
    validateWriteTextureSourceAllocation(destination, data, dataLayout, size);
    calls.push({ name: 'writeTexture', args: [destination, data, dataLayout, size] });
  };
  const setIndexBuffer = (buffer: WgpuBuffer, indexFormat: WgpuIndexFormat, offset = 0, size?: number): void => {
    validateRenderBufferRange('setIndexBuffer', buffer, offset, size, indexFormat === 'uint32' ? 4 : 2);
    calls.push({ name: 'setIndexBuffer', args: [buffer, indexFormat, offset, size] });
  };
  const setVertexBuffer = (slot: number, buffer: WgpuBuffer | null, offset = 0, size?: number): void => {
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
  } as unknown as WgpuRenderPassEncoder;

  // A recording command encoder whose beginRenderPass hands back the same recording pass — enough for
  // renderWgpuScene3DShadowMap and the IBL bake to drive their own render passes under JSDOM. `finish` returns
  // a plausible command buffer the recording queue's submit accepts.
  const commandEncoder = {
    beginRenderPass: record('beginRenderPass', renderPass),
    finish: record('finish', {}),
  } as unknown as WgpuCommandEncoder;

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
    createBuffer: (descriptor: WgpuBufferDescriptor) => {
      calls.push({ name: 'createBuffer', args: [descriptor] });
      return { destroy: () => {}, size: descriptor.size } as unknown as WgpuBuffer;
    },
    createPipelineLayout: record('createPipelineLayout', {}),
    createRenderPipeline: record('createRenderPipeline', {}),
    createSampler: (...args: unknown[]) => {
      calls.push({ name: 'createSampler', args });
      return {};
    },
    createShaderModule: (descriptor: unknown) => {
      calls.push({ name: 'createShaderModule', args: [descriptor] });
      return {} as WgpuShaderModule;
    },
    createTexture: (descriptor: WgpuTextureDescriptor) => {
      calls.push({ name: 'createTexture', args: [descriptor] });
      const [width, height, depthOrArrayLayers] = normalizeGpuExtent3D(descriptor.size);
      return {
        createView: () => ({}) as WgpuTextureView,
        depthOrArrayLayers,
        dimension: descriptor.dimension ?? '2d',
        destroy: () => {},
        format: descriptor.format,
        height,
        mipLevelCount: descriptor.mipLevelCount ?? 1,
        sampleCount: descriptor.sampleCount ?? 1,
        usage: descriptor.usage,
        width,
      } as unknown as WgpuTexture;
    },
  } as unknown as WgpuDevice;

  const state = createRenderState({ allowSmoothing: true }) as WgpuRenderState;

  const deviceState = createWgpuDeviceState(device);

  const runtime = createWgpuRenderStateRuntime(deviceState, registry);

  Object.assign(state, {
    applyBlendMode: null,
    device,
    deviceState,
    format: 'bgra8unorm',
    registries: runtime.registries,
  });

  const target = { colorAttachments: 1, context: null, height: 256, width: 256 } as WgpuTextureRenderTarget;
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
    textureBindGroupLayout: {} as WgpuBindGroupLayout,
    linearSampler: {} as WgpuSampler,
    nearestSampler: {} as WgpuSampler,
    samplerCache: new Map(),
    textureCache: new WeakMap(),
    currentRenderTarget: target,
    renderPass,
    // The fake stands in for a pass over a 256x256 surface: every draw reads this for its projection.
    renderTargetViewport: { height: 256, width: 256 },
    uniformBuffer: { destroy: () => {} } as unknown as WgpuBuffer,
    uniformBindGroupLayout: {} as WgpuBindGroupLayout,
    uniformData: new Float32Array(256 * 64),
    uniformDataU32: new Uint32Array(0),
    uniformOffset: 0,
    uniformStride: 256,
  } satisfies Partial<WgpuRenderStateRuntime>);
  state[EntityRuntimeKey] = runtime;

  // The fake pass the draw entry points take. It is bound to the same fake encoder the runtime carries,
  // so a test can assert on recorded calls exactly as before while the API says where the draw lands.
  const pass = allocateEntity<WgpuRenderPass>();
  pass.colorView = {} as WgpuTextureView;
  pass.encoder = renderPass;
  pass.ownsFrame = false;
  pass.saved = {
    clipForms: [],
    colorFormat: 'bgra8unorm',
    currentMaskDepth: 0,
    currentScissorRect: null,
    maskWriteMode: false,
    renderTarget: null,
    renderTargetViewport: null,
    scissorStack: [],
  };
  pass.state = state;
  pass.target = target;
  pass.viewport = { height: 256, width: 256 };

  return { fake: { calls }, pass: finishEntity(pass), state };
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

function getWriteTextureBytesPerTexel(format: WgpuTextureFormat): number | null {
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

function normalizeGpuExtent3D(size: WgpuExtent3D): [number, number, number] {
  if (Symbol.iterator in Object(size)) {
    const values = Array.from(size as Iterable<number>);
    return [values[0] ?? 1, values[1] ?? 1, values[2] ?? 1];
  }
  const dictionary = size as WgpuExtent3DDict;
  return [dictionary.width, dictionary.height ?? 1, dictionary.depthOrArrayLayers ?? 1];
}

// Keep source-allocation validation scoped to the uncompressed formats used by this helper's
// writeTexture paths. Block-compressed formats need a separate block-geometry model.
function validateWriteTextureSourceAllocation(
  destination: WgpuTexelCopyTextureInfo,
  data: WgpuBufferSource,
  dataLayout: WgpuTexelCopyBufferLayout,
  size: WgpuExtent3D,
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
  buffer: WgpuBuffer,
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
