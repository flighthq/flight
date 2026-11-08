import { describe, expect, it } from 'vitest';

import type { WgpuAdapter } from './WgpuAdapter.ts';
import type { WgpuBuffer } from './WgpuBuffer.ts';
import type { WgpuCanvasContext } from './WgpuCanvasContext.ts';
import type { WgpuCommandEncoder } from './WgpuCommandEncoder.ts';
import type { WgpuDevice } from './WgpuDevice.ts';
import type { WgpuGpu } from './WgpuGpu.ts';
import type { WgpuQueue } from './WgpuQueue.ts';
import type { WgpuRenderPassEncoder } from './WgpuRenderPassEncoder.ts';
import type { WgpuTexture } from './WgpuTexture.ts';
import type { WgpuTextureFormat } from './WgpuTextureFormat.ts';

// The Flight types are the contract; the browser's objects are one provider of it. Each assignment below
// fails to compile when the browser's typings stop satisfying a Flight type, which is the drift that would
// otherwise force a cast at the web host boundary.
describe('WgpuGpu', () => {
  it('is satisfied by the browser WebGPU objects without a cast', () => {
    const conform = (
      gpu: GPU,
      adapter: GPUAdapter,
      device: GPUDevice,
      queue: GPUQueue,
      encoder: GPUCommandEncoder,
      pass: GPURenderPassEncoder,
      buffer: GPUBuffer,
      texture: GPUTexture,
      context: GPUCanvasContext,
      format: GPUTextureFormat,
    ): readonly unknown[] => {
      const flightGpu: WgpuGpu = gpu;
      const flightAdapter: WgpuAdapter = adapter;
      const flightDevice: WgpuDevice = device;
      const flightQueue: WgpuQueue = queue;
      const flightEncoder: WgpuCommandEncoder = encoder;
      const flightPass: WgpuRenderPassEncoder = pass;
      const flightBuffer: WgpuBuffer = buffer;
      const flightTexture: WgpuTexture = texture;
      const flightContext: WgpuCanvasContext = context;
      const flightFormat: WgpuTextureFormat = format;
      return [
        flightGpu,
        flightAdapter,
        flightDevice,
        flightQueue,
        flightEncoder,
        flightPass,
        flightBuffer,
        flightTexture,
        flightContext,
        flightFormat,
      ];
    };
    expect(typeof conform).toBe('function');
  });
});
