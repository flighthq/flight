import { allocateEntity, createEntityRuntime } from '@flighthq/entity/contract';
import type { EntityConstruction, NativeSurfaceHandle, Surface, SurfaceRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

// Allocates a surface entity around a drawable the host just created, before any context is acquired on
// it. The handle goes on the runtime because it is a platform object that only the allocating host may
// narrow; the entity carries no trace of it, which is what keeps the portable layers free of DOM and
// native types. Per-kind factories add their own context field and finish the entity.
export function allocateSurface<T extends Surface>(handle: NativeSurfaceHandle): EntityConstruction<T> {
  const surface = allocateEntity<T>();
  const runtime = createEntityRuntime() as SurfaceRuntime;
  runtime.handle = handle;
  surface[EntityRuntimeKey] = runtime;
  return surface;
}

// The drawable a surface was built around. Hosts narrow this to their own platform type; portable code
// passes the surface itself and never reads through here.
export function getSurfaceHandle(surface: Readonly<Surface>): NativeSurfaceHandle {
  return getSurfaceRuntime(surface).handle;
}

export function getSurfaceRuntime(surface: Readonly<Surface>): SurfaceRuntime {
  return surface[EntityRuntimeKey] as SurfaceRuntime;
}
