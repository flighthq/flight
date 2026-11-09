import type { AppWindow } from '@flighthq/app/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import { allocateSurface } from './surface.ts';
import type { HostWgpuSurfaceCapability, NativeSurfaceHandle, SurfaceWithAcquisition } from './types.ts';

type GenericWgpuSurface<Acquisition> = SurfaceWithAcquisition<Acquisition, 'WgpuSurface'>;

// Allocates a drawable in the given window, sized in device pixels, and acquires a WebGPU device and
// presentation context for it. Returns null when the environment cannot provide WebGPU at all — no
// drawable, no adapter, no device — which is an expected outcome on a machine without it rather than API
// misuse, so it reports through the return value like every other expected failure here.
export async function createWgpuSurface<Acquisition, Options>(
  capability: Readonly<HostWgpuSurfaceCapability<Acquisition, Options>>,
  window: Readonly<AppWindow>,
  width: number,
  height: number,
  options?: Readonly<Partial<Options>>,
): Promise<GenericWgpuSurface<Acquisition> | null> {
  const handle = capability.create(window, width, height);
  if (handle === null) return null;
  return createWgpuSurfaceFromNativeHandle(capability, handle, options);
}

// Acquires a device and presentation context for a drawable the caller already owns.
export async function createWgpuSurfaceFromNativeHandle<Acquisition, Options>(
  capability: Readonly<HostWgpuSurfaceCapability<Acquisition, Options>>,
  handle: NativeSurfaceHandle,
  options?: Readonly<Partial<Options>>,
): Promise<GenericWgpuSurface<Acquisition> | null> {
  const surface = allocateSurface<GenericWgpuSurface<Acquisition>>(handle);
  surface.__brand = 'WgpuSurface' as const;
  // Every acquisition option is optional, so an empty object is a complete Partial<Options>; the checker
  // cannot prove that for an unresolved type parameter.
  let acquisition: Acquisition;
  try {
    acquisition = await capability.acquire(
      surface as GenericWgpuSurface<Acquisition>,
      options ?? ({} as Readonly<Partial<Options>>),
    );
  } catch {
    return null;
  }
  (surface as EntityConstruction<GenericWgpuSurface<Acquisition>>).acquisition = acquisition;
  return surface;
}

export function destroyWgpuSurface<Acquisition, Options>(
  capability: Readonly<HostWgpuSurfaceCapability<Acquisition, Options>>,
  surface: Readonly<GenericWgpuSurface<Acquisition>>,
): void {
  capability.release(surface.acquisition);
}
