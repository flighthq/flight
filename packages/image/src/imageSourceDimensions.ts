import type { HostImageDimensionResolver, HostImageDimensions, HostImageSource } from '@flighthq/types/contract';

// Reads the pixel size of a borrowed host handle through the registered host resolver, returning false
// when no resolver is registered or the registered one does not recognize this handle. `out` is left
// untouched in both cases, so a caller keeps whatever dimensions it already had.
export function getHostImageSourceDimensions(source: HostImageSource, out: HostImageDimensions): boolean {
  if (_resolver === null) return false;
  return _resolver(source, out);
}

// True once a host has installed its resolver. A caller that measures sources can require this rather
// than discovering silently-zero dimensions at draw time.
export function hasHostImageDimensionResolver(): boolean {
  return _resolver !== null;
}

// Installs the host's measurer. Opt-in, like every other host capability: an application registers the
// one its platform provides (registerWebImageDimensionResolver for the browser) and nothing in this
// package reaches for a platform global. Last registration wins.
export function registerHostImageDimensionResolver(resolver: HostImageDimensionResolver): void {
  _resolver = resolver;
}

export function unregisterHostImageDimensionResolver(): void {
  _resolver = null;
}

let _resolver: HostImageDimensionResolver | null = null;
