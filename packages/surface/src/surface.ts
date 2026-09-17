import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostSurfaceCreateCapability, Surface } from '@flighthq/types/contract';

export function createSurface(creator: Readonly<HostSurfaceCreateCapability>, width: number, height: number): Surface {
  const out = allocateEntity<Surface>();
  out.native = creator.createSurface(width, height);
  out.width = width;
  out.height = height;
  const surface = finishEntity(out);
  _surfaceCreators.set(surface, creator);
  return surface;
}

export function destroySurface(surface: Readonly<Surface>): void {
  const creator = _surfaceCreators.get(surface);
  if (creator === undefined) return;
  _surfaceCreators.delete(surface);
  creator.destroySurface(surface.native);
}

export function resizeSurface(surface: Surface, width: number, height: number): void {
  surface.native.width = width;
  surface.native.height = height;
  surface.width = width;
  surface.height = height;
}

const _surfaceCreators = new WeakMap<Readonly<Surface>, Readonly<HostSurfaceCreateCapability>>();
