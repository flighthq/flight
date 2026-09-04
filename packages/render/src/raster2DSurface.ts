import type { Raster2DSurface, Raster2DSurfaceProvider } from '@flighthq/types/contract';

export function createRaster2DSurface(
  provider: Readonly<Raster2DSurfaceProvider>,
  width: number,
  height: number,
): Raster2DSurface | null {
  const surface = provider.createRaster2DSurface(width, height);
  if (surface !== null) _surfaceProviders.set(surface, provider);
  return surface;
}

// A surface must return to the provider that allocated it even when the provider reference changes
// during its lifetime. Delete the ownership record before invoking the provider so repeated or
// reentrant destruction is a no-op and no non-GC resource can be freed twice.
export function destroyRaster2DSurface(surface: Raster2DSurface): void {
  const provider = _surfaceProviders.get(surface);
  if (provider === undefined) return;
  _surfaceProviders.delete(surface);
  provider.destroyRaster2DSurface(surface);
}

const _surfaceProviders = new WeakMap<Raster2DSurface, Readonly<Raster2DSurfaceProvider>>();
