import type { ImageSurface, ImageSurfaceCreator } from '@flighthq/types/contract';

export function createImageSurface(
  provider: Readonly<ImageSurfaceCreator>,
  width: number,
  height: number,
): ImageSurface | null {
  const surface = provider.createImageSurface(width, height);
  if (surface !== null) _surfaceProviders.set(surface, provider);
  return surface;
}

// A surface must return to the provider that allocated it even when the provider reference changes
// during its lifetime. Delete the ownership record before invoking the provider so repeated or
// reentrant destruction is a no-op and no non-GC resource can be freed twice.
export function destroyImageSurface(surface: ImageSurface): void {
  const provider = _surfaceProviders.get(surface);
  if (provider === undefined) return;
  _surfaceProviders.delete(surface);
  provider.destroyImageSurface(surface);
}

const _surfaceProviders = new WeakMap<ImageSurface, Readonly<ImageSurfaceCreator>>();
