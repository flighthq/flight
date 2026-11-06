import type { AppWindow } from '@flighthq/app/contract';
import { finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import { allocateSurface } from './surface.ts';
import type { HostSurfaceContextCapability, NativeSurfaceHandle, SurfaceWithContext } from './types.ts';

type GenericGlSurface<Context> = SurfaceWithContext<Context, 'GlSurface'>;

// Allocates a drawable in the given window, sized in device pixels, and acquires a GL context on it. The
// window is what the host needs to make a drawable at all — the document on web, the SDL_Window on SDL —
// and is not retained: a surface is not one-to-one with a window, and welding one on would assert that it
// is. Returns null when the host cannot allocate a drawable or the driver refuses a context.
export function createGlSurface<Context, Options>(
  capability: Readonly<HostSurfaceContextCapability<Context, Options>>,
  window: Readonly<AppWindow>,
  width: number,
  height: number,
  options?: Readonly<Options>,
): GenericGlSurface<Context> | null {
  const handle = capability.create(window, width, height, options);
  if (handle === null) return null;
  return createGlSurfaceFromNativeHandle(capability, handle, options);
}

// Acquires a GL context on a drawable the caller already owns — an adopted canvas or native window. The
// caller keeps ownership of the drawable; destroyGlSurface releases the context, never the drawable.
export function createGlSurfaceFromNativeHandle<Context, Options>(
  capability: Readonly<HostSurfaceContextCapability<Context, Options>>,
  handle: NativeSurfaceHandle,
  options?: Readonly<Options>,
): GenericGlSurface<Context> | null {
  const surface = allocateSurface<GenericGlSurface<Context>>(handle);
  surface.__brand = 'GlSurface' as const;
  // The runtime is already attached, which is all `acquire` reads; the context it returns is the last
  // field the entity needs before it is finished.
  const context = capability.acquire(surface as GenericGlSurface<Context>, options);
  if (context === null) return null;
  (surface as EntityConstruction<GenericGlSurface<Context>>).context = context;
  return finishEntity(surface);
}

export function destroyGlSurface<Context, Options>(
  capability: Readonly<HostSurfaceContextCapability<Context, Options>>,
  surface: Readonly<GenericGlSurface<Context>>,
): void {
  capability.release(surface);
}
