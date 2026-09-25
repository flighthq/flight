import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostWgpuCapability, WgpuHostAcquisition, WgpuSurfaceAttachResult } from '@flighthq/types/contract';

import { allocateWebSurfaceCanvas, getWebSurfaceCanvasHandle } from './webSurfaceHandle.ts';

function createWebHostWgpuContext(): HostWgpuCapability {
  const out = {} as HostWgpuCapability;
  initializeWebHostWgpuContext(out);
  return out;
}

function initializeWebHostWgpuContext(out: HostWgpuCapability): void {
  out.acquire = async (surface, options): Promise<WgpuHostAcquisition> => {
    const canvas = getWebSurfaceCanvasHandle(surface);
    if (canvas === null) throw new Error('Surface is not backed by a canvas element.');

    const gpu = getWebWgpu();
    if (gpu === null) throw new Error('WebGPU is not supported in this browser.');

    const adapter = await gpu.requestAdapter(
      options.powerPreference !== undefined ? { powerPreference: options.powerPreference } : undefined,
    );
    if (adapter === null) throw new Error('Failed to get WebGPU adapter.');

    const requiredLimits: Record<string, number> = {};
    if (adapter.limits.maxBindGroups >= 5) requiredLimits.maxBindGroups = 5;
    const requiredFeatures = (
      ['texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'] as GPUFeatureName[]
    ).filter((feature) => adapter.features.has(feature));
    const descriptor: GPUDeviceDescriptor = {};
    if (Object.keys(requiredLimits).length > 0) descriptor.requiredLimits = requiredLimits;
    if (requiredFeatures.length > 0) descriptor.requiredFeatures = requiredFeatures;
    const device = await adapter.requestDevice(descriptor);

    try {
      const format = options.format ?? gpu.getPreferredCanvasFormat();
      const context = canvas.getContext('webgpu');
      if (context === null) throw new Error('Failed to get WebGPU canvas context.');
      const acquisition = allocateEntity<WgpuHostAcquisition>();
      acquisition.context = context;
      acquisition.device = device;
      acquisition.format = format;
      acquisition.ownership = 'flight';
      acquisition.surface = canvas;
      return finishEntity(acquisition);
    } catch (error) {
      device.destroy();
      throw error;
    }
  };
  out.attachSurface = (surface, attachment): WgpuSurfaceAttachResult | null => {
    const canvas = getWebSurfaceCanvasHandle(surface);
    if (canvas === null) return null;
    const context = canvas.getContext('webgpu');
    if (context === null) return null;
    context.configure({
      device: attachment.device,
      format: attachment.format,
      alphaMode: attachment.alphaMode,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    return { context, surface: canvas };
  };
  // Allocation only: a device is adapter-scoped and is acquired separately, so making a drawable
  // cannot imply requesting one.
  out.create = (win, width: number, height: number) => allocateWebSurfaceCanvas(win, width, height);
  out.isSupported = (): boolean => {
    return getWebWgpu() !== null;
  };
  out.release = (acquisition): void => {
    acquisition.context.unconfigure();
    acquisition.device.destroy();
  };
}

export const webHostWgpuContext = createWebHostWgpuContext();

function getWebWgpu(): GPU | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.gpu ?? null;
  } catch {
    return null;
  }
}
