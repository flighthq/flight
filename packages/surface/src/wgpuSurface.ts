import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  HostTarget,
  HostWgpuCapability,
  WgpuHostAcquisition,
  WgpuHostAcquisitionOptions,
  WgpuScreenSurface,
  WgpuSurface,
} from '@flighthq/types/contract';

export async function createWgpuSurface(
  capability: Readonly<HostWgpuCapability>,
  target: HostTarget,
  screenSurface: WgpuScreenSurface,
  options?: Readonly<WgpuHostAcquisitionOptions>,
): Promise<WgpuSurface | null> {
  const acquisition = await capability.acquire(screenSurface, options ?? {});
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
