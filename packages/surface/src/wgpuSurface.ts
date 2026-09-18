import { finishEntity } from '@flighthq/entity/contract';
import type {
  AppWindow,
  EntityConstruction,
  HostWgpuCapability,
  NativeSurfaceHandle,
  WgpuHostAcquisition,
  WgpuHostAcquisitionOptions,
  WgpuSurface,
} from '@flighthq/types/contract';

import { allocateSurface } from './surface';

// Allocates a drawable in the given window, sized in device pixels, and acquires a WebGPU device and
// presentation context for it. Returns null when the environment cannot provide WebGPU at all — no
// drawable, no adapter, no device — which is an expected outcome on a machine without it rather than API
// misuse, so it reports through the return value like every other expected failure here.
export async function createWgpuSurface(
  capability: Readonly<HostWgpuCapability>,
  window: Readonly<AppWindow>,
  width: number,
  height: number,
  options?: Readonly<WgpuHostAcquisitionOptions>,
): Promise<WgpuSurface | null> {
  const handle = capability.create(window, width, height);
  if (handle === null) return null;
  return createWgpuSurfaceFromNativeHandle(capability, handle, options);
}

// Acquires a device and presentation context for a drawable the caller already owns.
export async function createWgpuSurfaceFromNativeHandle(
  capability: Readonly<HostWgpuCapability>,
  handle: NativeSurfaceHandle,
  options?: Readonly<WgpuHostAcquisitionOptions>,
): Promise<WgpuSurface | null> {
  const surface = allocateSurface<WgpuSurface>(handle);
  surface.__brand = 'WgpuSurface' as const;
  let acquisition: WgpuHostAcquisition;
  try {
    acquisition = await capability.acquire(surface as WgpuSurface, options ?? {});
  } catch {
    return null;
  }
  (surface as EntityConstruction<WgpuSurface>).acquisition = acquisition;
  return finishEntity(surface);
}

export function destroyWgpuSurface(capability: Readonly<HostWgpuCapability>, surface: Readonly<WgpuSurface>): void {
  capability.release(surface.acquisition);
}
