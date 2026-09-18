import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HostTarget,
  HostWgpuCapability,
  WgpuHostAcquisition,
  WgpuSurfaceAttachResult,
} from '@flighthq/types/contract';

export function createTestHostTarget(canvas: HTMLCanvasElement): HostTarget {
  const target = allocateEntity<HostTarget>();
  (target as EntityConstruction<HostTarget>).__brand = 'HostTarget' as const;
  _testTargets.set(target, canvas);
  return finishEntity(target);
}

export function createTestWgpuHostBackend(): HostWgpuCapability {
  const out = allocateEntity<HostWgpuCapability>();
  initializeTestWgpuHostBackend(out);
  return finishEntity(out);
}

function initializeTestWgpuHostBackend(out: EntityConstruction<HostWgpuCapability>): void {
  out.acquire = async (target, options): Promise<WgpuHostAcquisition> => {
    const canvas = _testTargets.get(target);
    if (canvas === undefined) throw new Error('Test target not registered.');

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
  out.attachSurface = (target, attachment): WgpuSurfaceAttachResult | null => {
    const canvas = _testTargets.get(target);
    if (canvas === undefined) return null;
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
  out.isSupported = (): boolean => {
    return getWebWgpu() !== null;
  };
  out.release = (acquisition): void => {
    acquisition.context.unconfigure();
    acquisition.device.destroy();
  };
}

const _testTargets = new WeakMap<HostTarget, HTMLCanvasElement>();

function getWebWgpu(): GPU | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.gpu ?? null;
  } catch {
    return null;
  }
}
