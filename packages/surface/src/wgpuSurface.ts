import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HostTarget,
  HostWgpuCapability,
  WgpuHostAcquisition,
  WgpuHostAcquisitionOptions,
  WgpuSurface,
} from '@flighthq/types/contract';

// Allocates a drawable of the given backing-store size in device pixels and acquires a WebGPU device and
// presentation context for it. Returns null when the environment cannot provide WebGPU at all — no
// drawable, no adapter, no device. That is an expected outcome on a machine without WebGPU rather than
// API misuse, so it reports through the return value like every other expected failure here.
export async function createWgpuSurface(
  capability: Readonly<HostWgpuCapability>,
  width: number,
  height: number,
  options?: Readonly<WgpuHostAcquisitionOptions>,
): Promise<WgpuSurface | null> {
  const target = capability.create(width, height);
  if (target === null) return null;
  return createWgpuSurfaceFromTarget(capability, target, options);
}

// Acquires a device and presentation context for a target the host already holds. The caller keeps
// ownership of the drawable.
export async function createWgpuSurfaceFromTarget(
  capability: Readonly<HostWgpuCapability>,
  target: HostTarget,
  options?: Readonly<WgpuHostAcquisitionOptions>,
): Promise<WgpuSurface | null> {
  let acquisition: WgpuHostAcquisition;
  try {
    acquisition = await capability.acquire(target, options ?? {});
  } catch {
    return null;
  }
  const surface = allocateEntity<WgpuSurface>();
  initializeWgpuSurface(surface, target, acquisition);
  return finishEntity(surface);
}

export function destroyWgpuSurface(capability: Readonly<HostWgpuCapability>, surface: Readonly<WgpuSurface>): void {
  capability.release(surface.acquisition);
}

function initializeWgpuSurface(
  surface: EntityConstruction<WgpuSurface>,
  target: HostTarget,
  acquisition: WgpuHostAcquisition,
): void {
  surface.__brand = 'WgpuSurface' as const;
  surface.acquisition = acquisition;
  surface.target = target;
}
