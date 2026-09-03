import { createEntity } from '@flighthq/entity/contract';
import type { Entity, WgpuHostAcquisition, WgpuHostBackend } from '@flighthq/types/contract';

// The explicit browser adapter. All WebGPU discovery and host-handle acquisition stays in this
// function's call graph so render-state creation can also consume native caller-provided handles.
export function createWebWgpuHostBackend(): WgpuHostBackend {
  return createEntity<Omit<WgpuHostBackend, keyof Entity>>({
    async acquire(canvas, options): Promise<WgpuHostAcquisition> {
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
        return createEntity({ context, device, format, ownership: 'flight', surface: canvas });
      } catch (error) {
        device.destroy();
        throw error;
      }
    },

    isSupported(): boolean {
      return getWebWgpu() !== null;
    },

    // Unconditional teardown. Ownership policy is NOT decided here: Flight never calls this for a
    // caller-owned acquisition, and `releaseWgpuAcquisition` calls it because the caller asked. A backend
    // that re-checked ownership would silently make the caller's own release verb a no-op.
    release(acquisition): void {
      acquisition.context.unconfigure();
      acquisition.device.destroy();
    },
  });
}

export function getWgpuHostBackend(): WgpuHostBackend {
  return _custom ?? _host ?? _web;
}

// First host wins and a custom backend installed through setWgpuHostBackend always takes precedence.
export function installWgpuHostBackend(backend: WgpuHostBackend): void {
  if (_host === null) _host = backend;
}

export function resetWgpuHostBackendForTest(): void {
  _custom = null;
  _host = null;
}

// Installs a process-wide custom backend. Clearing it reveals the first installed host, or the
// built-in explicit web adapter when no host has been installed.
export function setWgpuHostBackend(backend: WgpuHostBackend | null): void {
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
let _custom: WgpuHostBackend | null = null;
let _host: WgpuHostBackend | null = null;
