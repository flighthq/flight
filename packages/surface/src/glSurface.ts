import { finishEntity } from '@flighthq/entity/contract';
import type {
  AppWindow,
  EntityConstruction,
  GlContextOptions,
  GlSurface,
  HostGlCapability,
  NativeSurfaceHandle,
} from '@flighthq/types/contract';

import { allocateSurface } from './surface';

// Allocates a drawable in the given window, sized in device pixels, and acquires a GL context on it. The
// window is what the host needs to make a drawable at all — the document on web, the SDL_Window on SDL —
// and is not retained: a surface is not one-to-one with a window, and welding one on would assert that it
// is. Returns null when the host cannot allocate a drawable or the driver refuses a context.
export function createGlSurface(
  capability: Readonly<HostGlCapability>,
  window: Readonly<AppWindow>,
  width: number,
  height: number,
  options?: Readonly<GlContextOptions>,
): GlSurface | null {
  const handle = capability.create(window, width, height, options);
  if (handle === null) return null;
  return createGlSurfaceFromNativeHandle(capability, handle, options);
}

// Acquires a GL context on a drawable the caller already owns — an adopted canvas or native window. The
// caller keeps ownership of the drawable; destroyGlSurface releases the context, never the drawable.
export function createGlSurfaceFromNativeHandle(
  capability: Readonly<HostGlCapability>,
  handle: NativeSurfaceHandle,
  options?: Readonly<GlContextOptions>,
): GlSurface | null {
  const surface = allocateSurface<GlSurface>(handle);
  surface.__brand = 'GlSurface' as const;
  // The runtime is already attached, which is all `acquire` reads; the context it returns is the last
  // field the entity needs before it is finished.
  const context = capability.acquire(surface as GlSurface, options);
  if (context === null) return null;
  (surface as EntityConstruction<GlSurface>).context = context;
  return finishEntity(surface);
}

export function destroyGlSurface(capability: Readonly<HostGlCapability>, surface: Readonly<GlSurface>): void {
  capability.release(surface);
}
