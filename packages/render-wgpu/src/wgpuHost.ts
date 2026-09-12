import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, WgpuHostAcquisition, HostWgpuProvider } from '@flighthq/types/contract';

// The explicit browser adapter. All WebGPU discovery and host-handle acquisition stays in this
// function's call graph so render-state creation can also consume native caller-provided handles.
export function createWebWgpuHostBackend(): HostWgpuProvider {
  const out = allocateEntity<HostWgpuProvider>();
  initializeWebWgpuHostBackend(out);
  return finishEntity(out);
}

export function getWgpuHostBackend(): HostWgpuProvider {
  return _custom ?? _host ?? _web;
}

export function initializeWebWgpuHostBackend(out: EntityConstruction<HostWgpuProvider>): void {
  out.acquire = async (canvas, options): Promise<WgpuHostAcquisition> => {
    const gpu = getWebWgpu();
    if (gpu === null) throw new Error('WebGPU is not supported in this browser.');

    const adapter = await gpu.requestAdapter(
      options.powerPreference !== undefined ? { powerPreference: options.powerPreference } : undefined,
    );
    if (adapter === null) throw new Error('Failed to get WebGPU adapter.');

    // The forward-lit 3D pipeline binds 5 groups (Frame, Draw, Material, Shadow, Ibl); request 5
    // only when the adapter advertises it so baseline-4 adapters retain the portable paths.
    const requiredLimits: Record<string, number> = {};
    if (adapter.limits.maxBindGroups >= 5) requiredLimits.maxBindGroups = 5;
    // Compression features have to be enabled when the device is created. Unsupported families
    // retain their CPU decode fallback.
    const requiredFeatures = (
      ['texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'] as GPUFeatureName[]
    ).filter((feature) => adapter.features.has(feature));
    const descriptor: GPUDeviceDescriptor = {};
    if (Object.keys(requiredLimits).length > 0) descriptor.requiredLimits = requiredLimits;
    if (requiredFeatures.length > 0) descriptor.requiredFeatures = requiredFeatures;
    const device = await adapter.requestDevice(descriptor);

    try {
      const format = options.format ?? gpu.getPreferredCanvasFormat();
      const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
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
  out.attachSurface = (surface, attachment): GPUCanvasContext | null => {
    const context = surface.getContext('webgpu');
    if (context === null) return null;
    // COPY_SRC lets the swap-chain texture be read back with copyTextureToBuffer. It is the only reliable
    // way to read a Wgpu frame in headless/software contexts, and it also backs user-facing screenshots.
    context.configure({
      device: attachment.device,
      format: attachment.format,
      alphaMode: attachment.alphaMode,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    return context;
  };
  out.isSupported = (): boolean => {
    return getWebWgpu() !== null;
  };
  out.release = (acquisition): void => {
    acquisition.context.unconfigure();
    acquisition.device.destroy();
  };
}

// First host wins and a custom backend installed through setWgpuHostBackend always takes precedence.
export function installWgpuHostBackend(backend: HostWgpuProvider): void {
  if (_host === null) _host = backend;
}

export function resetWgpuHostBackendForTest(): void {
  _custom = null;
  _host = null;
}

// Installs a process-wide custom backend. Clearing it reveals the first installed host, or the
// built-in explicit web adapter when no host has been installed.
export function setWgpuHostBackend(backend: HostWgpuProvider | null): void {
  _custom = backend;
}

function getWebWgpu(): GPU | null {
  if (typeof navigator === 'undefined') return null;
  try {
    return navigator.gpu ?? null;
  } catch {
    return null;
  }
}

const _web = createWebWgpuHostBackend();
let _custom: HostWgpuProvider | null = null;
let _host: HostWgpuProvider | null = null;
