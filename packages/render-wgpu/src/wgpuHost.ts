import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import type {
  HostWgpuCapability,
  NativeSurfaceHandle,
  Surface,
  SurfaceRuntime,
  WgpuHostAcquisition,
  WgpuSurfaceAttachResult,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

// Builds a Surface around an existing canvas, the way a host's create lane would. Reads the runtime slot
// directly rather than through @flighthq/surface so this test double adds no package dependency.
export function createTestWgpuSurface(canvas: HTMLCanvasElement): Surface {
  const surface = allocateEntity<Surface>();
  const runtime = createEntityRuntime() as SurfaceRuntime;
  runtime.handle = canvas;
  surface[EntityRuntimeKey] = runtime;
  return finishEntity(surface);
}

export const testWgpuHost: HostWgpuCapability = initializeTestWgpuHost();

function initializeTestWgpuHost(): HostWgpuCapability {
  return {
    create: (_window, width, height): NativeSurfaceHandle => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    acquire: async (surface, options): Promise<WgpuHostAcquisition> => {
      const canvas = testCanvas(surface);
      if (canvas === null) throw new Error('Test surface is not backed by a canvas.');

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
    },
    attachSurface: (surface, attachment): WgpuSurfaceAttachResult | null => {
      const canvas = testCanvas(surface);
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
    },
    isSupported: (): boolean => {
      return getWebWgpu() !== null;
    },
    release: (acquisition): void => {
      acquisition.context.unconfigure();
      acquisition.device.destroy();
    },
  } as HostWgpuCapability;
}

function testCanvas(surface: Readonly<Surface>): HTMLCanvasElement | null {
  const handle = (surface[EntityRuntimeKey] as SurfaceRuntime).handle;
  return handle instanceof HTMLCanvasElement ? handle : null;
}

function getWebWgpu(): GPU | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.gpu ?? null;
  } catch {
    return null;
  }
}
